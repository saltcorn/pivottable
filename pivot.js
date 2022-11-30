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

const remove_unused_fields = (fields, columns, rows) => {
  const used_fields = new Set(
    columns.filter((c) => c.type === "Field").map((c) => c.field)
  );
  const unused_fields = new Set([]);
  fields.forEach((f) => {
    if (!used_fields.has(f.name)) unused_fields.add(f.name);
  });
  for (const row of rows)
    [...unused_fields].forEach((fnm) => {
      delete row[fnm];
    });
};

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "Columns",
        disablePreview: true,
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          const fields = await table.getFields();
          const json_fields = fields.filter((f) => f?.type?.name === "JSON");
          const { parent_field_list } = await table.get_parent_relations(
            true,
            true
          );
          return new Form({
            blurb: "Select the columns that can be included in the pivot table",
            fields: [
              new FieldRepeat({
                name: "columns",
                fields: [
                  {
                    name: "type",
                    label: "Type",
                    type: "String",
                    required: true,
                    attributes: {
                      options: [
                        { name: "Field", label: "Field" },
                        { name: "JoinField", label: "Join Field" },
                        // { name: "Aggregation", label: __("Aggregation") }
                      ],
                    },
                  },
                  {
                    name: "field",
                    label: "Field",
                    type: "String",
                    required: true,
                    attributes: {
                      options: fields.map((f) => f.name),
                    },
                    showIf: { type: "Field" },
                  },
                  {
                    name: "expand_subfields",
                    label: "Exapand subfields",
                    sublabel: "Exapand all subfields in schema",
                    type: "Bool",
                    showIf: {
                      type: "Field",
                      field: json_fields.map((f) => f.name),
                    },
                  },
                  {
                    name: "subfield",
                    label: "Subfield",
                    type: "String",
                    showIf: {
                      type: "Field",
                      expand_subfields: false,
                      field: json_fields.map((f) => f.name),
                    },
                  },
                  {
                    name: "join_field",
                    label: "Join Field",
                    type: "String",
                    required: true,
                    attributes: {
                      options: parent_field_list,
                    },
                    showIf: { type: "JoinField" },
                  },
                  {
                    name: "label",
                    label: "Label",
                    type: "String",
                  },
                ],
              }),
            ],
          });
        },
      },
      {
        name: "Pivot table",
        disablePreview: true,
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          const { joinFields, aggregations } = picked_fields_to_query(
            context.columns,
            fields
          );

          let tbl_rows = await table.getJoinedRows({
            where: {},
            joinFields,
            aggregations,
          });
          remove_unused_fields(fields, context.columns, tbl_rows);
          return new Form({
            blurb: [
              div({ id: "pivotoutput" }),
              script(
                domReady(`
          const renderers = window.Plotly ? $.extend($.pivotUtilities.renderers,
            $.pivotUtilities.plotly_renderers) : $.pivotUtilities.renderers;
          $("#pivotoutput").pivotUI(${buildDataXform(
            fields,
            context.columns,
            tbl_rows
          )}, {
            ...(${JSON.stringify(context.config || {})}),
            renderers,
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
          })`)
              ),
            ],
            fields: [
              {
                name: "config",
                label: " ",
                type: "JSON",
                fieldview: "edit",
                class: "d-none",
              },
              {
                name: "show_ui",
                label: "Show UI",
                sublabel: "Allow the user to change the table settings",
                type: "Bool",
              },
            ],
          });
        },
      },
      {
        name: "Plotly options",
        form: async () => {
          return new Form({
            fields: [
              {
                name: "height",
                label: "Height",
                type: "Integer",
              },
              {
                name: "width",
                label: "Width",
                type: "Integer",
              },
            ],
          });
        },
      },
    ],
  });

const buildDataXform = (fields, columns, rows) => `
function (injectRecord) {
  ${JSON.stringify(rows)}.map(function (row) {
    injectRecord({
      ${columns
        .map((col) => {
          if (col.type === "JoinField")
            return `"${
              col.label || col.join_field.replaceAll(".", "_")
            }":row["${col.join_field.replaceAll(".", "_")}"],`;
          if (col.type === "Field") {
            if (col.expand_subfields) {
              const field = fields.find((f) => f.name === col.field);
              return (field.attributes?.schema || [])
                .map(
                  (t) =>
                    `"${(col.label || col.field) + "." + t.key}":row["${
                      col.field
                    }"]?.["${t.key}"],`
                )
                .join("");
            } else if (col.subfield)
              return `"${
                col.label ||
                (fields.find((f) => f.name === col.field)?.label || col.field) +
                  "." +
                  col.subfield
              }":row["${col.field}"]?.["${col.subfield}"],`;
            else
              return `"${
                col.label ||
                fields.find((f) => f.name === col.field)?.label ||
                col.field
              }":row["${col.field}"],`;
          }
          return "";
        })
        .join("")}
    });
  });
}
`;

const run = async (
  table_id,
  viewname,
  { config, columns, show_ui, height, width },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const where = await stateFieldsToWhere({ fields, state });
  const q = await stateFieldsToQuery({ state, fields, prefix: "a." });

  const { joinFields, aggregations } = picked_fields_to_query(columns, fields);

  let tbl_rows = await table.getJoinedRows({
    where,
    joinFields,
    aggregations,
    ...q,
  });
  remove_unused_fields(fields, columns, tbl_rows);

  const newConfig = {
    ...config,
    showUI: show_ui,
    rendererOptions: { plotly: {} },
  };
  if (height) newConfig.rendererOptions.plotly.height = height;
  if (width) newConfig.rendererOptions.plotly.width = width;

  return (
    div({ id: "pivotoutput" }) +
    script(
      domReady(`
  const renderers = window.Plotly ? $.extend($.pivotUtilities.renderers,
    $.pivotUtilities.plotly_renderers) : $.pivotUtilities.renderers;
  $("#pivotoutput").pivotUI(${buildDataXform(fields, columns, tbl_rows)}, 
  {
    ...(${JSON.stringify(newConfig)}),
    renderers
  })
  `)
    )
  );
};

const initial_config = async ({ table_id, exttable_name }) => {
  const table = await Table.findOne(
    table_id ? { id: table_id } : { name: exttable_name }
  );

  const fields = await table.getFields();
  let columns = [];

  fields.forEach((f) => {
    if (f.primary_key || f.type === "File") return;
    else if (f.is_fkey && f.attributes.summary_field)
      columns.push({
        type: "JoinField",
        join_field: `${f.name}.${f.attributes.summary_field}`,
        label: `${f.label} ${f.attributes.summary_field}`,
      });
    else columns.push({ type: "Field", field: f.name, label: f.label });
  });

  return { columns };
};
module.exports = {
  name: "Pivot table",
  get_state_fields,
  configuration_workflow,
  run,
  initial_config,
};
