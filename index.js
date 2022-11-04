const Field = require("@saltcorn/data/models/field");

const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const {
  text,
  div,
  h5,
  style,
  a,
  script,
  pre,
  domReady,
  button,
  i,
  form,
  input,
  label,
  text_attr,
  select,
  option,
} = require("@saltcorn/markup/tags");
const { getState, features } = require("@saltcorn/data/db/state");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  initial_config_all_fields,
  stateToQueryString,
  stateFieldsToQuery,
  link_view,
  getActionConfigFields,
  readState,
  run_action_column,
} = require("@saltcorn/data/plugin-helper");

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "Columns",
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          const fields = await table.getFields();
          return new Form({
            fields: [
              {
                name: "rows",
                label: "Rows",
                type: "String",
                attributes: {
                  options: fields.map(f => f.name),
                },
              },
              {
                name: "cols",
                label: "Columns",
                type: "String",
                attributes: {
                  options: fields.map(f => f.name),
                },
              },
            ],
          });
        }
      }
    ]
  })

const run = async (
  table_id,
  viewname,
  { rows, cols },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const where = await stateFieldsToWhere({ fields, state });
  const q = await stateFieldsToQuery({ state, fields, prefix: "a." });
  const { joinFields, aggregations } = picked_fields_to_query(columns, fields);

  let rows = await table.getJoinedRows({
    where,
    joinFields,
    aggregations,
    ...q,
  });
  return div({ id: "pivotoutput" }) + script(domReady(`
  $("#output").pivotUI(${JSON.stringify(rows)}, {
    rows: ["${rows}"],
    cols: ["${cols}"],
  })
  `))
}

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
      css: `/plugins/public/pivottable@${require("./package.json").version}/pivot.min.css`,
    },
  ],
  sc_plugin_api_version: 1,
  plugin_name: "pivottable",
  viewtemplates: [
    {
      name: "Pivot table",
      get_state_fields,
      configuration_workflow,
      run,
    },
  ],
};
