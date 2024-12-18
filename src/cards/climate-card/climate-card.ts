import { UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  css,
  CSSResultGroup,
  html,
  nothing,
  PropertyValues,
  TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  actionHandler,
  ActionHandlerEvent,
  computeRTL,
  handleAction,
  hasAction,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  LovelaceLayoutOptions,
  RenderTemplateResult,
  subscribeRenderTemplate,
} from "../../ha";
import "../../shared/shape-icon";
import "../../shared/state-info";
import "../../shared/state-item";
import { computeAppearance } from "../../utils/appearance";
import { MushroomBaseElement } from "../../utils/base-element";
import { cardStyle } from "../../utils/card-styles";
import { computeRgbColor } from "../../utils/colors";
import { registerCustomCard } from "../../utils/custom-cards";
import { getWeatherSvgIcon } from "../../utils/icons/weather-icon";
import { weatherSVGStyles } from "../../utils/weather";
import { CLIMATE_CARD_EDITOR_NAME, CLIMATE_CARD_NAME, CLIMATE_ENTITY_DOMAINS } from "./const";
import { ClimateCardConfig } from "./climate-card-config";

registerCustomCard({
  type: CLIMATE_CARD_NAME,
  name: "Mushroom Climate Card",
  description: "Card for climate entity",
});

const TEMPLATE_KEYS = [
  "primary_template",
  "secondary_template",
] as const;
type TemplateKey = (typeof TEMPLATE_KEYS)[number];

@customElement(CLIMATE_CARD_NAME)
export class ClimateCard extends MushroomBaseElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./climate-card-editor");
    return document.createElement(
      CLIMATE_CARD_EDITOR_NAME
    ) as LovelaceCardEditor;
  }

  public static async getStubConfig(
    hass: HomeAssistant
  ): Promise<ClimateCardConfig> {
    const entities = Object.keys(hass.states);
    const climates = entities.filter((e) =>
      CLIMATE_ENTITY_DOMAINS.includes(e.split(".")[0])
    );
    return {
      type: `custom:${CLIMATE_CARD_NAME}`,
      entity: climates[0],
    };
  }

  @state() private _config?: ClimateCardConfig;

  @state() private _templateResults: Partial<
    Record<TemplateKey, RenderTemplateResult | undefined>
  > = {};

  @state() private _unsubRenderTemplates: Map<
    TemplateKey,
    Promise<UnsubscribeFunc>
  > = new Map();

  @property({ reflect: true, type: String })
  public layout: string | undefined;

  public getCardSize(): number | Promise<number> {
    let height = 1;
    if (!this._config) return height;
    const appearance = computeAppearance(this._config);
    if (appearance.layout === "vertical") {
      height += 1;
    }
    return height;
  }

  public getLayoutOptions(): LovelaceLayoutOptions {
    const options: LovelaceLayoutOptions = {
      grid_columns: 2,
      grid_rows: 1,
    };
    if (!this._config) return options;
    const appearance = computeAppearance(this._config);
    if (appearance.layout === "vertical") {
      options.grid_rows! += 1;
    }
    if (appearance.layout === "horizontal") {
      options.grid_columns = 4;
    }
    if (this._config?.multiline_secondary) {
      options.grid_rows = undefined;
    }
    return options;
  }

  // For HA < 2024.11
  public getGridOptions(): LovelaceGridOptions {
    // No min and max because the content can be dynamic
    const options: LovelaceGridOptions = {
      columns: 6,
      rows: 1,
    };
    if (!this._config) return options;
    const appearance = computeAppearance(this._config);
    if (appearance.layout === "vertical") {
      options.rows! += 1;
    }
    if (appearance.layout === "horizontal") {
      options.columns = 12;
    }
    if (this._config?.multiline_secondary) {
      options.rows = undefined;
    }
    return options;
  }

  setConfig(config: ClimateCardConfig): void {
    TEMPLATE_KEYS.forEach((key) => {
      if (
        this._config?.[key] !== config[key] ||
        this._config?.entity != config.entity
      ) {
        this._tryDisconnectKey(key);
      }
    });
    this._config = {
      tap_action: {
        action: "toggle",
      },
      hold_action: {
        action: "more-info",
      },
      ...config,
    };
  }

  public connectedCallback() {
    super.connectedCallback();
    this._tryConnect();
  }

  public disconnectedCallback() {
    this._tryDisconnect();
  }

  private _handleAction(ev: ActionHandlerEvent) {
    handleAction(this, this.hass!, this._config!, ev.detail.action!);
  }

  public isTemplate(key: TemplateKey) {
    const value = this._config?.[key];
    return value?.includes("{");
  }

  private getValue(key: TemplateKey) {
    return this.isTemplate(key)
      ? this._templateResults[key]?.result?.toString()
      : this._config?.[key];
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const primary = this.getValue("primary_template");
    const secondary = this.getValue("secondary_template");

    const multiline_secondary = this._config.multiline_secondary;

    const rtl = computeRTL(this.hass);

    const appearance = computeAppearance({
      fill_container: this._config.fill_container,
      layout: this._config.layout,
      primary_info: Boolean(primary) ? "template" : "none",
      primary_template: primary,
      secondary_info: Boolean(secondary) ? "template" : "none",
      secondary_template: secondary,
    });

    return html`
      <ha-card
        class=${classMap({ "fill-container": appearance.fill_container })}
      >
        <mushroom-card .appearance=${appearance} ?rtl=${rtl}>
          <mushroom-state-item
            ?rtl=${rtl}
            .appearance=${appearance}
            @action=${this._handleAction}
            .actionHandler=${actionHandler({
              hasHold: hasAction(this._config.hold_action),
              hasDoubleClick: hasAction(this._config.double_tap_action),
            })}
          >
            <mushroom-state-info
              slot="info"
              .primary=${primary}
              .secondary=${secondary}
              .multiline_secondary=${multiline_secondary}
            ></mushroom-state-info>
          </mushroom-state-item>
        </mushroom-card>
      </ha-card>
    `;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._config || !this.hass) {
      return;
    }

    this._tryConnect();
  }

  private async _tryConnect(): Promise<void> {
    TEMPLATE_KEYS.forEach((key) => {
      this._tryConnectKey(key);
    });
  }

  private async _tryConnectKey(key: TemplateKey): Promise<void> {
    if (
      this._unsubRenderTemplates.get(key) !== undefined ||
      !this.hass ||
      !this._config ||
      !this.isTemplate(key)
    ) {
      return;
    }

    try {
      const sub = subscribeRenderTemplate(
        this.hass.connection,
        (result) => {
          this._templateResults = {
            ...this._templateResults,
            [key]: result,
          };
        },
        {
          template: this._config[key] ?? "",
          entity_ids: this._config.entity_id,
          variables: {
            config: this._config,
            user: this.hass.user!.name,
            entity: this._config.entity,
          },
          strict: true,
        }
      );
      this._unsubRenderTemplates.set(key, sub);
      await sub;
    } catch (_err) {
      const result = {
        result: this._config[key] ?? "",
        listeners: {
          all: false,
          domains: [],
          entities: [],
          time: false,
        },
      };
      this._templateResults = {
        ...this._templateResults,
        [key]: result,
      };
      this._unsubRenderTemplates.delete(key);
    }
  }
  private async _tryDisconnect(): Promise<void> {
    TEMPLATE_KEYS.forEach((key) => {
      this._tryDisconnectKey(key);
    });
  }

  private async _tryDisconnectKey(key: TemplateKey): Promise<void> {
    const unsubRenderTemplate = this._unsubRenderTemplates.get(key);
    if (!unsubRenderTemplate) {
      return;
    }

    try {
      const unsub = await unsubRenderTemplate;
      unsub();
      this._unsubRenderTemplates.delete(key);
    } catch (err: any) {
      if (err.code === "not_found" || err.code === "template_error") {
        // If we get here, the connection was probably already closed. Ignore.
      } else {
        throw err;
      }
    }
  }

  static get styles(): CSSResultGroup {
    return [
      super.styles,
      cardStyle,
      css`
        mushroom-state-item {
          cursor: pointer;
        }
        mushroom-shape-icon {
          --icon-color: rgb(var(--rgb-disabled));
          --shape-color: rgba(var(--rgb-disabled), 0.2);
        }
        svg {
          width: var(--icon-size);
          height: var(--icon-size);
          display: flex;
        }
        ${weatherSVGStyles}
      `,
    ];
  }
}