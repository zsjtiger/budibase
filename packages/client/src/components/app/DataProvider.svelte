<script>
  import { getContext } from "svelte"
  import { Pagination, ProgressCircle } from "@budibase/bbui"
  import { fetchData, LuceneUtils } from "@budibase/frontend-core"

  export let dataSource
  export let filter
  export let sortColumn
  export let sortOrder
  export let limit
  export let paginate
  export let autoRefresh

  const { styleable, Provider, ActionTypes, API } = getContext("sdk")
  const component = getContext("component")

  let interval
  let queryExtensions = {}

  // We need to manage our lucene query manually as we want to allow components
  // to extend it
  $: defaultQuery = LuceneUtils.buildLuceneQuery(filter)
  $: query = extendQuery(defaultQuery, queryExtensions)
  $: fetch = createFetch(dataSource)
  $: fetch.update({
    query,
    sortColumn,
    sortOrder,
    limit,
    paginate,
  })
  $: schema = sanitizeSchema($fetch.schema)
  $: setUpAutoRefresh(autoRefresh)
  $: actions = [
    {
      type: ActionTypes.RefreshDatasource,
      callback: () => fetch.refresh(),
      metadata: { dataSource },
    },
    {
      type: ActionTypes.AddDataProviderQueryExtension,
      callback: addQueryExtension,
    },
    {
      type: ActionTypes.RemoveDataProviderQueryExtension,
      callback: removeQueryExtension,
    },
    {
      type: ActionTypes.SetDataProviderSorting,
      callback: ({ column, order }) => {
        let newOptions = {}
        if (column) {
          newOptions.sortColumn = column
        }
        if (order) {
          newOptions.sortOrder = order
        }
        if (Object.keys(newOptions)?.length) {
          fetch.update(newOptions)
        }
      },
    },
  ]
  $: dataContext = {
    rows: $fetch.rows,
    info: $fetch.info,
    datasource: dataSource || {},
    schema,
    rowsLength: $fetch.rows.length,
    pageNumber: $fetch.pageNumber + 1,
    // Undocumented properties. These aren't supposed to be used in builder
    // bindings, but are used internally by other components
    id: $component?.id,
    state: {
      query: $fetch.query,
      sortColumn: $fetch.sortColumn,
      sortOrder: $fetch.sortOrder,
    },
    limit,
    primaryDisplay: $fetch.definition?.primaryDisplay,
  }

  const createFetch = datasource => {
    return fetchData({
      API,
      datasource,
      options: {
        query,
        sortColumn,
        sortOrder,
        limit,
        paginate,
      },
    })
  }

  const sanitizeSchema = schema => {
    if (!schema) {
      return schema
    }
    let cloned = { ...schema }
    Object.entries(cloned).forEach(([field, fieldSchema]) => {
      if (fieldSchema.visible === false) {
        delete cloned[field]
      }
    })
    return cloned
  }

  const addQueryExtension = (key, extension) => {
    if (!key || !extension) {
      return
    }
    queryExtensions = { ...queryExtensions, [key]: extension }
  }

  const removeQueryExtension = key => {
    if (!key) {
      return
    }
    const newQueryExtensions = { ...queryExtensions }
    delete newQueryExtensions[key]
    queryExtensions = newQueryExtensions
  }

  const extendQuery = (defaultQuery, extensions) => {
    const extensionValues = Object.values(extensions || {})
    let extendedQuery = { ...defaultQuery }
    extensionValues.forEach(extension => {
      Object.entries(extension || {}).forEach(([operator, fields]) => {
        extendedQuery[operator] = {
          ...extendedQuery[operator],
          ...fields,
        }
      })
    })
    return extendedQuery
  }

  const setUpAutoRefresh = autoRefresh => {
    clearInterval(interval)
    if (autoRefresh) {
      interval = setInterval(fetch.refresh, Math.max(10000, autoRefresh * 1000))
    }
  }
</script>

<div use:styleable={$component.styles} class="container">
  <Provider {actions} data={dataContext}>
    {#if !$fetch.loaded}
      <div class="loading">
        <ProgressCircle />
      </div>
    {:else}
      <slot />
      {#if paginate && $fetch.supportsPagination}
        <div class="pagination">
          <Pagination
            page={$fetch.pageNumber + 1}
            hasPrevPage={$fetch.hasPrevPage}
            hasNextPage={$fetch.hasNextPage}
            goToPrevPage={fetch.prevPage}
            goToNextPage={fetch.nextPage}
          />
        </div>
      {/if}
    {/if}
  </Provider>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
  }
  .loading {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    height: 100px;
  }
  .pagination {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
    margin-top: var(--spacing-xl);
  }
</style>
