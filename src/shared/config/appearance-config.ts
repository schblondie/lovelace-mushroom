import { boolean, enums, Infer, object, optional, string } from "superstruct";
import { HaFormSchema } from "../../utils/form/ha-form";
import { IconType, ICON_TYPES, Info, INFOS } from "../../utils/info";
import { Layout, layoutStruct } from "../../utils/layout";

export const appearanceSharedConfigStruct = object({
  layout: optional(layoutStruct),
  fill_container: optional(boolean()),
  primary_info: optional(enums(INFOS)),
  primary_template: optional(string()),
  secondary_info: optional(enums(INFOS)),
  secondary_template: optional(string()),
  icon_type: optional(enums(ICON_TYPES)),
});

export type AppearanceSharedConfig = Infer<typeof appearanceSharedConfigStruct>;

export type Appearance = {
  layout: Layout;
  fill_container: boolean;
  primary_info: Info;
  primary_template?: string;
  secondary_info: Info;
  secondary_template?: string;
  icon_type: IconType;
};

export const APPEARANCE_FORM_SCHEMA: HaFormSchema[] = [
  {
    type: "grid",
    name: "",
    schema: [
      { name: "layout", selector: { mush_layout: {} } },
      { name: "fill_container", selector: { boolean: {} } },
    ],
  },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "primary_info", selector: { mush_info: {} } },
      { name: "secondary_info", selector: { mush_info: {} } },
      { name: "icon_type", selector: { mush_icon_type: {} } },
    ],
  },
  {
    type: "conditional",
    conditions: [{ primary_info: "template" }],
    name: "primary_template",
    schema: [
      {
        name: "primary_template",
        selector: {
          text: {
            multiline: true,
          },
        },
      },
    ],
  },
  {
    type: "conditional",
    conditions: [{ secondary_info: "template" }],
    name: "secondary_template",
    schema: [
      {
        name: "secondary_template",
        selector: {
          text: {
            multiline: true,
          },
        },
      },
    ],
  },
];