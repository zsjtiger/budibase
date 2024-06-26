import { get, writable, derived } from "svelte/store"
import { parseEventLocation } from "../lib/utils"

const reorderInitialState = {
  sourceColumn: null,
  targetColumn: null,
  breakpoints: [],
  gridLeft: 0,
  width: 0,
  latestX: 0,
  increment: 0,
}

export const createStores = () => {
  const reorder = writable(reorderInitialState)
  const isReordering = derived(
    reorder,
    $reorder => !!$reorder.sourceColumn,
    false
  )
  return {
    reorder,
    isReordering,
  }
}

export const createActions = context => {
  const {
    reorder,
    columns,
    visibleColumns,
    scroll,
    bounds,
    stickyColumn,
    maxScrollLeft,
    width,
    datasource,
  } = context

  let autoScrollInterval
  let isAutoScrolling

  // Callback when dragging on a colum header and starting reordering
  const startReordering = (column, e) => {
    const $visibleColumns = get(visibleColumns)
    const $bounds = get(bounds)
    const $stickyColumn = get(stickyColumn)

    // Generate new breakpoints for the current columns
    let breakpoints = $visibleColumns.map(col => ({
      x: col.left + col.width,
      column: col.name,
    }))
    if ($stickyColumn) {
      breakpoints.unshift({
        x: 0,
        column: $stickyColumn.name,
      })
    } else if (!$visibleColumns[0].primaryDisplay) {
      breakpoints.unshift({
        x: 0,
        column: null,
      })
    }

    // Update state
    reorder.set({
      sourceColumn: column,
      targetColumn: null,
      breakpoints,
      gridLeft: $bounds.left,
      width: $bounds.width,
    })

    // Add listeners to handle mouse movement
    document.addEventListener("mousemove", onReorderMouseMove)
    document.addEventListener("mouseup", stopReordering)
    document.addEventListener("touchmove", onReorderMouseMove)
    document.addEventListener("touchend", stopReordering)
    document.addEventListener("touchcancel", stopReordering)

    // Trigger a move event immediately so ensure a candidate column is chosen
    onReorderMouseMove(e)
  }

  // Callback when moving the mouse when reordering columns
  const onReorderMouseMove = e => {
    // Immediately handle the current position
    const { x } = parseEventLocation(e)
    reorder.update(state => ({
      ...state,
      latestX: x,
    }))
    considerReorderPosition()

    // Check if we need to start auto-scrolling
    const $reorder = get(reorder)
    const proximityCutoff = Math.min(140, get(width) / 6)
    const speedFactor = 16
    const rightProximity = Math.max(0, $reorder.gridLeft + $reorder.width - x)
    const leftProximity = Math.max(0, x - $reorder.gridLeft)
    if (rightProximity < proximityCutoff) {
      const weight = proximityCutoff - rightProximity
      const increment = (weight / proximityCutoff) * speedFactor
      reorder.update(state => ({ ...state, increment }))
      startAutoScroll()
    } else if (leftProximity < proximityCutoff) {
      const weight = -1 * (proximityCutoff - leftProximity)
      const increment = (weight / proximityCutoff) * speedFactor
      reorder.update(state => ({ ...state, increment }))
      startAutoScroll()
    } else {
      stopAutoScroll()
    }
  }

  // Actual logic to consider the current position and determine the new order
  const considerReorderPosition = () => {
    const $reorder = get(reorder)
    const $scroll = get(scroll)

    // Compute the closest breakpoint to the current position
    let targetColumn
    let minDistance = Number.MAX_SAFE_INTEGER
    const mouseX = $reorder.latestX - $reorder.gridLeft + $scroll.left
    $reorder.breakpoints.forEach(point => {
      const distance = Math.abs(point.x - mouseX)
      if (distance < minDistance) {
        minDistance = distance
        targetColumn = point.column
      }
    })
    if (targetColumn !== $reorder.targetColumn) {
      reorder.update(state => ({
        ...state,
        targetColumn,
      }))
    }
  }

  // Commences auto-scrolling in a certain direction, triggered when the mouse
  // approaches the edges of the grid
  const startAutoScroll = () => {
    if (isAutoScrolling) {
      return
    }
    isAutoScrolling = true
    autoScrollInterval = setInterval(() => {
      const $maxLeft = get(maxScrollLeft)
      const { increment } = get(reorder)
      scroll.update(state => ({
        ...state,
        left: Math.max(0, Math.min($maxLeft, state.left + increment)),
      }))
      considerReorderPosition()
    }, 10)
  }

  // Stops auto scrolling
  const stopAutoScroll = () => {
    isAutoScrolling = false
    clearInterval(autoScrollInterval)
  }

  // Callback when stopping reordering columns
  const stopReordering = async () => {
    // Ensure auto-scrolling is stopped
    stopAutoScroll()

    // Remove event handlers
    document.removeEventListener("mousemove", onReorderMouseMove)
    document.removeEventListener("mouseup", stopReordering)
    document.removeEventListener("touchmove", onReorderMouseMove)
    document.removeEventListener("touchend", stopReordering)
    document.removeEventListener("touchcancel", stopReordering)

    // Ensure there's actually a change before saving
    const { sourceColumn, targetColumn } = get(reorder)
    reorder.set(reorderInitialState)
    if (sourceColumn !== targetColumn) {
      await moveColumn(sourceColumn, targetColumn)
    }
  }

  // Moves a column after another columns.
  // An undefined target column will move the source to index 0.
  const moveColumn = async (sourceColumn, targetColumn) => {
    let $columns = get(columns)
    let sourceIdx = $columns.findIndex(x => x.name === sourceColumn)
    let targetIdx = $columns.findIndex(x => x.name === targetColumn)
    targetIdx++
    columns.update(state => {
      const removed = state.splice(sourceIdx, 1)
      if (--targetIdx < sourceIdx) {
        targetIdx++
      }
      return state.toSpliced(targetIdx, 0, removed[0])
    })

    // Extract new orders as schema mutations
    let mutations = {}
    get(columns).forEach((column, idx) => {
      mutations[column.name] = { order: idx }
    })
    datasource.actions.addSchemaMutations(mutations)
    await datasource.actions.saveSchemaMutations()
  }

  // Moves a column one place left (as appears visually)
  const moveColumnLeft = async column => {
    const $visibleColumns = get(visibleColumns)
    const sourceIdx = $visibleColumns.findIndex(x => x.name === column)
    await moveColumn(column, $visibleColumns[sourceIdx - 2]?.name)
  }

  // Moves a column one place right (as appears visually)
  const moveColumnRight = async column => {
    const $visibleColumns = get(visibleColumns)
    const sourceIdx = $visibleColumns.findIndex(x => x.name === column)
    if (sourceIdx === $visibleColumns.length - 1) {
      return
    }
    await moveColumn(column, $visibleColumns[sourceIdx + 1]?.name)
  }

  return {
    reorder: {
      ...reorder,
      actions: {
        startReordering,
        stopReordering,
        moveColumnLeft,
        moveColumnRight,
      },
    },
  }
}
