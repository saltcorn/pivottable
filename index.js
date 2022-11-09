module.exports = {
  headers: [
    {
      script: `/plugins/public/pivottable@${require("./package.json").version}/jquery-ui.min.js`,
    },
    {
      css: `/plugins/public/pivottable@${require("./package.json").version}/jquery-ui.min.css`,
    },
    {
      script: `/plugins/public/pivottable@${require("./package.json").version}/pivot.min.js`,
    },
    {
      script: `/plugins/public/pivottable@${require("./package.json").version}/plotly_renderers.min.js`,
      defer: true
    },
    {
      css: `/plugins/public/pivottable@${require("./package.json").version}/pivot.min.css`,
    },
  ],
  dependencies: ["@saltcorn/json", "@saltcorn/visualize"],
  sc_plugin_api_version: 1,
  plugin_name: "pivottable",
  viewtemplates: [
    require("./pivot")
  ],
};
