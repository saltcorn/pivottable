module.exports = {
  headers: [
    {
      script: `/plugins/public/pivottable@${
        require("./package.json").version
      }/jquery-ui.min.js`,
      onlyViews: ["Pivot table"],
    },
    {
      css: `/plugins/public/pivottable@${
        require("./package.json").version
      }/jquery-ui.min.css`,
      onlyViews: ["Pivot table"],
    },
    {
      script: `/plugins/public/pivottable@${
        require("./package.json").version
      }/pivot.min.js`,
      onlyViews: ["Pivot table"],
    },
    {
      script: `/plugins/public/pivottable@${
        require("./package.json").version
      }/moment.min.js`,
      onlyViews: ["Pivot table"],
    },
    {
      script: `/plugins/public/pivottable@${
        require("./package.json").version
      }/plotly_renderers.min.js`,
      defer: true,
      onlyViews: ["Pivot table"],
    },
    {
      css: `/plugins/public/pivottable@${
        require("./package.json").version
      }/pivot.min.css`,
      onlyViews: ["Pivot table"],
    },
  ],
  dependencies: ["@saltcorn/json", "@saltcorn/visualize"],
  sc_plugin_api_version: 1,
  plugin_name: "pivottable",
  viewtemplates: [require("./pivot")],
};
