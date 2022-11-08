const Field = require("@saltcorn/data/models/field");

const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
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
        name: "Join fields",
        disablePreview: true,
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          const { parent_field_list } = await table.get_parent_relations(
            true,
            true
          );
          return new Form({
            blurb: "Select the join fields that can be included in the pivot table",
            fields: [
              new FieldRepeat({
                name: "joinfields",
                fields: [
                  {
                    name: "join_field",
                    label: "Join Field",
                    type: "String",
                    required: true,
                    attributes: {
                      options: parent_field_list,
                    },
                  },
                ]
              })
            ],
          });
        }
      },
      {
        name: "Columns",
        disablePreview: true,
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();
          const columns = (context.joinfields || []).map(({ join_field }) => ({
            type: "JoinField",
            join_field
          }))
          const { joinFields, aggregations } = picked_fields_to_query(columns, fields);

          let tbl_rows = await table.getJoinedRows({
            where: {},
            joinFields,
            //aggregations,            

          });
          return new Form({
            blurb: [
              div({ id: "pivotoutput" }), script(domReady(`          
          $("#pivotoutput").pivotUI(${JSON.stringify(tbl_rows)}, {
            ...(${JSON.stringify(context.config || {})}),
            onRefresh: (cfg)=>{
              var config_copy = JSON.parse(JSON.stringify(cfg));
              //console.log("predelete", JSON.stringify(config_copy,null,2))
              //delete some values which are functions
              delete config_copy["aggregators"];
              delete config_copy["renderers"];
              //delete some bulky default values
              delete config_copy["rendererOptions"];
              delete config_copy["localeStrings"];
              $("textarea[name=config]").val(JSON.stringify(config_copy))
              $("textarea[name=config]").closest("form").trigger("change")
            }
          })`))
            ],
            fields: [
              {
                name: "config",
                label: " ",
                type: "JSON",
                fieldview: "edit",
                class: "d-none"
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
  { config, joinfields },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const where = await stateFieldsToWhere({ fields, state });
  const q = await stateFieldsToQuery({ state, fields, prefix: "a." });
  //const { joinFields, aggregations } = picked_fields_to_query(columns, fields);
  const columns = (joinfields || []).map(({ join_field }) => ({
    type: "JoinField",
    join_field
  }))
  const { joinFields, aggregations } = picked_fields_to_query(columns, fields);

  let tbl_rows = await table.getJoinedRows({
    where,
    joinFields,
    //aggregations,
    ...q,
  });

  const newConfig = { ...config, showUI: false }

  return div({ id: "pivotoutput" }) + script(domReady(`
  $("#pivotoutput").pivotUI(${JSON.stringify(tbl_rows)}, 
  ${JSON.stringify(newConfig)})
  `))
}
module.exports = {
  name: "Pivot table",
  get_state_fields,
  configuration_workflow,
  run,
}