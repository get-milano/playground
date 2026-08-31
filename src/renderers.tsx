// The playground's design system: Material UI, wired to Milano through
// renderers. This is the whole point of the framework made literal, and
// the reason the playground is worth reading as an example: Milano never
// draws, so every pixel here belongs to MUI, and the documents in the
// editors know nothing about it.
//
// A renderer is an ordinary React component that receives one resolved
// node. Reads are gate-guaranteed, so the `??` fallbacks below cover
// declared optionals only.
import { MilanoValue } from "@get-milano/core";
import { createMilanoRegistry } from "@get-milano/react";
import type {
  MilanoNode,
  MilanoPlaceholderRenderer,
  MilanoReactRegistry,
  MilanoRenderer,
} from "@get-milano/react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

function text(node: MilanoNode, name: string): string {
  return node.property(name).stringValue ?? "";
}

function optionalText(node: MilanoNode, name: string): string | undefined {
  return node.property(name).stringValue ?? undefined;
}

function flag(node: MilanoNode, name: string, fallback: boolean): boolean {
  return node.property(name).boolValue ?? fallback;
}

function integer(node: MilanoNode, name: string, fallback: number): number {
  const value = node.property(name).intValue;
  return value === null ? fallback : Number(value);
}

/** A declared enum member, or the fallback when the optional is absent. */
function member<T extends string>(node: MilanoNode, name: string, fallback: T): T {
  return (node.property(name).stringValue as T | null) ?? fallback;
}

/**
 * Every rendered root carries the node's reference as a data attribute, so
 * the playground's inspect mode can walk from a pixel back to the node
 * that produced it. Hosts need nothing like this; it is the playground
 * being a teaching tool.
 */
function refTag(node: MilanoNode): { "data-milano-ref": string } {
  return { "data-milano-ref": node.reference };
}

const Column: MilanoRenderer = ({ node }) => (
  <Stack {...refTag(node)} spacing={`${integer(node, "spacing", 12)}px`} sx={{ p: 2 }}>
    {node.children}
  </Stack>
);

const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  spaceBetween: "space-between",
};

const Row: MilanoRenderer = ({ node }) => (
  <Stack
    {...refTag(node)}
    direction="row"
    spacing={`${integer(node, "spacing", 8)}px`}
    sx={{
      alignItems: "center",
      flexWrap: "wrap",
      justifyContent: JUSTIFY[member(node, "justify", "start")] ?? "flex-start",
    }}
  >
    {node.children}
  </Stack>
);

const Text: MilanoRenderer = ({ node }) => {
  if (!flag(node, "visible", true)) return null;
  const role = member<"title" | "subtitle" | "body" | "caption">(node, "role", "body");
  const liveRegion = node.property("liveRegion").stringValue;
  return (
    <Typography
      {...refTag(node)}
      variant={
        role === "title" ? "h6" : role === "subtitle" ? "subtitle2" : role === "caption" ? "caption" : "body2"
      }
      color={role === "subtitle" || role === "caption" ? "text.secondary" : "text.primary"}
      aria-live={liveRegion === null ? undefined : (liveRegion as "polite" | "assertive")}
      component={role === "title" ? "h2" : "p"}
    >
      {text(node, "text")}
    </Typography>
  );
};

const BUTTON_VARIANTS = {
  primary: "contained",
  secondary: "outlined",
  tertiary: "text",
} as const;

const ButtonRenderer: MilanoRenderer = ({ node }) => {
  if (!flag(node, "visible", true)) return null;
  return (
    <Button
      {...refTag(node)}
      variant={BUTTON_VARIANTS[member<keyof typeof BUTTON_VARIANTS>(node, "role", "primary")] ?? "contained"}
      size="small"
      disabled={!flag(node, "enabled", true)}
      onClick={() => node.emit("tap")}
    >
      {text(node, "label")}
    </Button>
  );
};

const TextFieldRenderer: MilanoRenderer = ({ node }) => {
  if (!flag(node, "visible", true)) return null;
  const error = optionalText(node, "error");
  return (
    <TextField
      {...refTag(node)}
      size="small"
      fullWidth
      label={text(node, "label")}
      value={text(node, "value")}
      placeholder={optionalText(node, "placeholder")}
      required={flag(node, "required", false)}
      error={error !== undefined}
      helperText={error}
      onChange={(event) => node.emit("change", MilanoValue.string(event.target.value))}
      onFocus={() => node.userInteraction("focusGained")}
      onBlur={() => node.userInteraction("focusLost")}
    />
  );
};

const NumberFieldRenderer: MilanoRenderer = ({ node }) => {
  if (!flag(node, "visible", true)) return null;
  return (
    <TextField
      {...refTag(node)}
      size="small"
      type="number"
      label={text(node, "label")}
      value={node.property("value").numberValue ?? 0}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        if (Number.isFinite(parsed)) node.emit("change", MilanoValue.double(parsed));
      }}
      onFocus={() => node.userInteraction("focusGained")}
      onBlur={() => node.userInteraction("focusLost")}
    />
  );
};

const CheckboxRenderer: MilanoRenderer = ({ node }) => {
  if (!flag(node, "visible", true)) return null;
  return (
    <FormControlLabel
      {...refTag(node)}
      control={
        <Checkbox
          size="small"
          checked={flag(node, "checked", false)}
          onChange={(event) => node.emit("change", MilanoValue.bool(event.target.checked))}
        />
      }
      label={<Typography variant="body2">{text(node, "label")}</Typography>}
    />
  );
};

type BannerLayout = "overlay" | "card" | "strip";
type BannerAlignment =
  | "topLeading"
  | "topTrailing"
  | "center"
  | "bottomLeading"
  | "bottomTrailing";

const ALIGNMENTS: Record<BannerAlignment, { justifyContent: string; alignItems: string }> = {
  topLeading: { justifyContent: "flex-start", alignItems: "flex-start" },
  topTrailing: { justifyContent: "flex-start", alignItems: "flex-end" },
  center: { justifyContent: "center", alignItems: "center" },
  bottomLeading: { justifyContent: "flex-end", alignItems: "flex-start" },
  bottomTrailing: { justifyContent: "flex-end", alignItems: "flex-end" },
};

const Banner: MilanoRenderer = ({ node }) => {
  if (!flag(node, "visible", true)) return null;
  const layout = member<BannerLayout>(node, "layout", "overlay");
  const imageUrl = optionalText(node, "backgroundImageUrl");
  const radius = integer(node, "cornerRadius", 16);

  if (layout === "strip") {
    return (
      <Alert
        {...refTag(node)}
        severity="info"
        icon={false}
        sx={{ m: 2, borderRadius: `${radius}px`, "& .MuiAlert-message": { width: "100%" } }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          {node.children}
        </Stack>
      </Alert>
    );
  }

  const alignment = ALIGNMENTS[member<BannerAlignment>(node, "contentAlignment", "bottomLeading")];
  const content = (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 2.5,
        // Over a photograph the content is light whatever the theme is,
        // the same decision the SwiftUI and Compose samples make.
        color: "common.white",
        "& .MuiTypography-root": { color: "common.white" },
        ...alignment,
      }}
    >
      {node.children}
    </Box>
  );

  return (
    <Card
      {...refTag(node)}
      elevation={layout === "card" ? 3 : 0}
      sx={{
        position: "relative",
        m: 2,
        height: integer(node, "height", layout === "card" ? 170 : 260),
        borderRadius: `${radius}px`,
        overflow: "hidden",
        backgroundColor: "grey.800",
        backgroundImage: imageUrl === undefined ? undefined : `url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {flag(node, "showScrim", true) ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))",
          }}
        />
      ) : null}
      {content}
    </Card>
  );
};

const CardRenderer: MilanoRenderer = ({ node }) => (
  <Card {...refTag(node)} variant="outlined" sx={{ borderRadius: `${integer(node, "cornerRadius", 12)}px` }}>
    <CardActionArea
      onClick={() => node.emit("tap")}
      aria-label={optionalText(node, "accessibilityLabel")}
      sx={{ p: `${integer(node, "padding", 12)}px` }}
    >
      <Stack spacing={1}>{node.children}</Stack>
    </CardActionArea>
  </Card>
);

const ImageRenderer: MilanoRenderer = ({ node }) => {
  const decorative = flag(node, "decorative", false);
  return (
    <Box
      {...refTag(node)}
      component="img"
      src={text(node, "url")}
      alt={decorative ? "" : (optionalText(node, "contentDescription") ?? "")}
      aria-hidden={decorative || undefined}
      sx={{
        width: integer(node, "width", 0) || "100%",
        height: integer(node, "height", 160),
        objectFit: "cover",
        borderRadius: `${integer(node, "cornerRadius", 0)}px`,
        backgroundColor: "action.hover",
      }}
    />
  );
};

const BADGE_TONES = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
} as const;

const Badge: MilanoRenderer = ({ node }) => {
  const tone = node.property("tone").stringValue as keyof typeof BADGE_TONES | null;
  return (
    <Chip
      {...refTag(node)}
      size="small"
      label={text(node, "text")}
      color={tone === null ? "default" : (BADGE_TONES[tone] ?? "default")}
    />
  );
};

/**
 * Unknown types under the `placeholder` policy arrive as data, never as
 * live children. The playground shows what it could not render, which is
 * exactly what the policy is for.
 */
const Placeholder: MilanoPlaceholderRenderer = ({ node }) => (
  <Alert severity="warning" variant="outlined" sx={{ my: 1 }}>
    <Typography variant="caption">
      unknown component <code>{node.type}</code> at <code>{node.reference}</code>
    </Typography>
  </Alert>
);

/**
 * A component the playground has no Material mapping for. The vocabulary
 * is the author's, so this is the common case for a new document: it draws
 * the type, the resolved property values, and a button per declared event
 * so the runtime can still be exercised.
 */
function generic(
  properties: readonly string[],
  events: readonly string[],
): MilanoRenderer {
  return function GenericNode({ node }) {
    return (
      <Box
        {...refTag(node)}
        sx={{
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip size="small" variant="outlined" label={node.type} />
          <Typography variant="caption" color="text.secondary">
            {node.reference}
          </Typography>
        </Stack>
        {properties.map((name) => (
          <Typography key={name} variant="caption" sx={{ fontFamily: "monospace" }}>
            {name}: {node.property(name).toString()}
          </Typography>
        ))}
        {events.length === 0 ? null : (
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            {events.map((event) => (
              <Button key={event} size="small" variant="outlined" onClick={() => node.emit(event)}>
                {event}
              </Button>
            ))}
          </Stack>
        )}
        {node.children.length === 0 ? null : <Stack spacing={1}>{node.children}</Stack>}
      </Box>
    );
  };
}

/**
 * Every component the playground can draw with Material. Anything else a
 * vocabulary declares gets the generic renderer above, so the registry
 * always covers the vocabulary and the engine always starts.
 */
export const RENDERERS: Readonly<Record<string, MilanoRenderer>> = {
  Column,
  Row,
  Stack: Column,
  Text,
  Label: Text,
  Button: ButtonRenderer,
  TextField: TextFieldRenderer,
  Field: TextFieldRenderer,
  NumberField: NumberFieldRenderer,
  Checkbox: CheckboxRenderer,
  Toggle: CheckboxRenderer,
  Banner,
  Card: CardRenderer,
  Image: ImageRenderer,
  Badge,
  Chip: Badge,
};

/**
 * A registry covering exactly what the vocabulary declares: Material where
 * the playground knows the component, the generic renderer everywhere
 * else. The engine checks registry coverage at creation, so building this
 * from the vocabulary is what lets an author use any names they like.
 */
export interface ComponentShape {
  readonly properties: readonly string[];
  readonly events: readonly string[];
}

export function registryFor(
  components: Readonly<Record<string, ComponentShape>>,
): MilanoReactRegistry {
  const registry = createMilanoRegistry();
  for (const [type, shape] of Object.entries(components)) {
    registry.register(type, RENDERERS[type] ?? generic(shape.properties, shape.events));
  }
  registry.registerPlaceholder(Placeholder);
  return registry;
}
