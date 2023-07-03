const Field = require("@saltcorn/data/models/field");

const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const User = require("@saltcorn/data/models/user");
const Workflow = require("@saltcorn/data/models/workflow");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const {
  text,
  div,
  textarea,
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

const public_user_role = features?.public_user_role || 10;

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table = Table.findOne(table_id);
  const table_fields = table.fields;
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
          const date_fields = fields.filter((f) => f?.type?.name === "Date");
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
                    name: "format",
                    label: "Date format",
                    type: "String",
                    sublabel: "moment.js format specifier",
                    showIf: {
                      type: "Field",
                      field: date_fields.map((f) => f.name),
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
          const roles = await User.get_roles();

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
              {
                name: "has_presets",
                label: "Presets",
                sublabel: "Allow the user to store table settings",
                type: "Bool",
                showIf: { show_ui: true },
              },
              {
                name: "min_role_preset_edit",
                label: "Role to edit",
                sublabel: "Role required to edit presets",
                input_type: "select",
                showIf: { show_ui: true, has_presets: true },
                options: roles.map((r) => ({ value: r.id, label: r.role })),
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
                attributes: { asideNext: true },
              },
              {
                name: "height_units",
                label: "Units",
                type: "String",
                fieldview: "radio_group",
                attributes: {
                  inline: true,
                  options: ["px", "vh"],
                },
              },
              {
                name: "width",
                label: "Width",
                type: "Integer",
                attributes: { asideNext: true },
              },
              {
                name: "width_units",
                label: "Units",
                type: "String",
                fieldview: "radio_group",
                attributes: {
                  inline: true,
                  options: ["px", "vw"],
                },
              },

              { name: "fontSize", label: "Font size", type: "Integer" },
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
              col.label || col.join_field.replace(/\./g, "_")
            }":row["${col.join_field.replace(/\./g, "_")}"],`;
          if (col.type === "Field") {
            if (col.format) {
              return `"${
                col.label ||
                fields.find((f) => f.name === col.field)?.label ||
                col.field
              }":moment(row["${col.field}"]).format(${JSON.stringify(
                col.format
              )}),`;
            }
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

const presetsBtn = (presets, can_edit, viewname, rndid) =>
  div(
    { class: "dropdown d-inline mx-1" },
    button(
      {
        class: "btn btn-sm btn-outline-secondary dropdown-toggle",
        "data-boundary": "viewport",
        type: "button",
        id: "btnHideCols",
        "data-bs-toggle": "dropdown",
        "aria-haspopup": "true",
        "aria-expanded": "false",
      },
      "Presets"
    ),
    div(
      {
        class: "dropdown-menu",
        "aria-labelledby": "btnHideCols",
      },
      form(
        { class: "px-2 tabShowHideCols" },

        Object.entries(presets || {}).map(([k, v]) =>
          div(
            a(
              {
                href: `javascript:activate_pivot_preset('${encodeURIComponent(
                  JSON.stringify(v)
                )}');`,
              },
              k
            ),
            can_edit &&
              a(
                {
                  href: `javascript:delete_pivot_preset('${k}');`,
                },
                i({ class: "fas fa-trash-alt" })
              )
          )
        ),
        can_edit &&
          a(
            {
              class: "d-block",
              href: `javascript:add_pivot_preset('${viewname}');`,
            },
            i({ class: "fas fa-plus" }),
            "Add"
          )
      )
    )
  ) +
  script(`
  function add_pivot_preset(viewname) {
    let name = prompt("Name of new preset");
    if (!name) return;
    const preset = JSON.parse($("textarea#pivotpresetcfg").val());
    view_post('${viewname}', "add_preset", {
      name,
      preset,
    });
  }
  function delete_pivot_preset(name) {
    view_post('${viewname}', "delete_preset", {
      name,
    });
  }
  function activate_pivot_preset(cfgs) {

    const cfg = JSON.parse(decodeURIComponent(cfgs))    
    $("#pivotoutput${rndid}").pivotUI(window.pivot_table_data, 
      {
        ...window.pivot_table_config, 
        ...cfg,
        renderers: window.pivot_table_renderers,
        onRefresh: (cfg)=>{
          var config_copy = JSON.parse(JSON.stringify(cfg));
          //delete some values which are functions
          delete config_copy["aggregators"];
          delete config_copy["renderers"];
          //delete some bulky default values
          delete config_copy["rendererOptions"];
          delete config_copy["localeStrings"];
          $("textarea#pivotpresetcfg").val(JSON.stringify(config_copy))              
         }      
      }, true)
  }
  `);

const run = async (
  table_id,
  viewname,
  {
    config,
    columns,
    show_ui,
    height,
    width,
    height_units,
    width_units,
    fontSize,
    presets,
    has_presets,
    min_role_preset_edit,
  },
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
  if (fontSize) newConfig.rendererOptions.plotly.font = { size: fontSize };

  const rndid = Math.floor(Math.random() * 16777215).toString(16);

  let presetHtml = has_presets
    ? presetsBtn(
        presets,
        (extraArgs.req?.user?.role_id || public_user_role) <=
          (min_role_preset_edit || 1),
        viewname,
        rndid
      ) + textarea({ style: { display: "none" }, id: "pivotpresetcfg" })
    : "";

  return (
    presetHtml +
    div({ id: "pivotoutput" + rndid }) +
    script(
      domReady(`
      window.pivot_table_renderers = window.Plotly ? $.extend($.pivotUtilities.renderers,
    $.pivotUtilities.plotly_renderers) : $.pivotUtilities.renderers;
    window.pivot_table_data = ${buildDataXform(fields, columns, tbl_rows)};
    window.pivot_table_config = ${JSON.stringify(newConfig)};
    ${
      height_units === "vh" && height
        ? `window.pivot_table_config.rendererOptions.plotly.height 
             = window.innerHeight*${height}/100`
        : ""
    }
    ${
      width_units === "vw" && width
        ? `window.pivot_table_config.rendererOptions.plotly.width 
             = window.innerWidth*${width}/100`
        : ""
    }
  $("#pivotoutput${rndid}").pivotUI(window.pivot_table_data, 
  {
    ...window.pivot_table_config,
    renderers: window.pivot_table_renderers,
     ${
       has_presets
         ? `onRefresh: (cfg)=>{
      var config_copy = JSON.parse(JSON.stringify(cfg));
      //delete some values which are functions
      delete config_copy["aggregators"];
      delete config_copy["renderers"];
      //delete some bulky default values
      delete config_copy["rendererOptions"];
      delete config_copy["localeStrings"];
      $("textarea#pivotpresetcfg").val(JSON.stringify(config_copy))
          }`
         : ""
     }
    
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

const add_preset = async (
  table_id,
  viewname,
  { presets, min_role_preset_edit },
  body,
  { req, res }
) => {
  if ((req.user?.role_id || public_user_role) > (min_role_preset_edit || 1)) {
    console.log("not authorized", min_role_preset_edit);
    return;
  }
  const newPresets = presets || {};
  newPresets[body.name] = body.preset;
  const view = await View.findOne({ name: viewname });
  const newConfig = {
    configuration: { ...view.configuration, presets: newPresets },
  };
  await View.update(newConfig, view.id);
};

const delete_preset = async (
  table_id,
  viewname,
  { presets, min_role_preset_edit },
  body,
  { req, res }
) => {
  if ((req.user?.role_id || public_user_role) > +(min_role_preset_edit || 1)) {
    console.log("not authorized");
    return;
  }

  const newPresets = presets || {};
  delete newPresets[body.name];
  const view = await View.findOne({ name: viewname });
  const newConfig = {
    configuration: { ...view.configuration, presets: newPresets },
  };
  await View.update(newConfig, view.id);
};

module.exports = {
  name: "Pivot table",
  get_state_fields,
  configuration_workflow,
  run,
  initial_config,
  routes: {
    add_preset,
    delete_preset,
  },
};
