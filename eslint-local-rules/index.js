module.exports = {
  "no-budibase-imports": {
    create: function (context) {
      return {
        ImportDeclaration(node) {
          const importPath = node.source.value

          if (
            /^@budibase\/[^/]+\/.*$/.test(importPath) &&
            importPath !== "@budibase/backend-core/tests" &&
            importPath !== "@budibase/string-templates/test/utils"
          ) {
            context.report({
              node,
              message: `Importing from @budibase is not allowed, except for @budibase/backend-core/tests and @budibase/string-templates/test/utils.`,
            })
          }
        },
      }
    },
  },
  "no-test-com": {
    meta: {
      type: "problem",
      docs: {
        description:
          "disallow the use of 'test.com' in strings and replace it with 'example.com'",
        recommended: true,
      },
      schema: [], // no options
      fixable: "code", // Indicates that this rule supports automatic fixing
    },
    create: function (context) {
      return {
        Literal(node) {
          if (
            typeof node.value === "string" &&
            node.value.includes("test.com")
          ) {
            context.report({
              node,
              message:
                "test.com is a privately owned domain and could point anywhere, use example.com instead.",
              fix: function (fixer) {
                const newText = node.raw.replace(/test\.com/g, "example.com")
                return fixer.replaceText(node, newText)
              },
            })
          }
        },
      }
    },
  },
  "email-domain-example-com": {
    meta: {
      type: "problem",
      docs: {
        description:
          "enforce using the example.com domain for generator.email calls",
        recommended: true,
      },
      fixable: "code",
      schema: [],
    },
    create: function (context) {
      return {
        CallExpression(node) {
          if (
            node.callee.type === "MemberExpression" &&
            node.callee.object.name === "generator" &&
            node.callee.property.name === "email" &&
            node.arguments.length === 0
          ) {
            context.report({
              node,
              message:
                "Prefer using generator.email with the domain \"{ domain: 'example.com' }\".",
              fix: function (fixer) {
                return fixer.replaceText(
                  node,
                  'generator.email({ domain: "example.com" })'
                )
              },
            })
          }
        },
      }
    },
  },
  "remove-only-from-tests": {
    meta: {
      type: "suggestion",
      docs: {
        description: "reminds you to move .only from tests before committing.",
        recommended: true,
      },
      schema: [],
    },
    create: function (context) {
      return {
        CallExpression(node) {
          if (
            node.callee.type === "MemberExpression" &&
            (node.callee.object.name === "it" ||
              node.callee.object.name === "describe") &&
            node.callee.property.name === "only"
          ) {
            context.report({
              node: node.callee,
              message: "Remember to remove .only from tests before committing.",
            })
          }
        },
      }
    },
  },
}
