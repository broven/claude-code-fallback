import { describe, expect, it } from "vitest";
import {
  cleanSchemaForGemini,
  cleanToolSchemasForGeminiRequest,
} from "../../utils/clean-for-gemini";

describe("cleanSchemaForGemini", () => {
  it("removes unsupported keywords recursively", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          minLength: 1,
          format: "email",
        },
      },
      required: ["query"],
    };

    const cleaned = cleanSchemaForGemini(schema) as any;

    expect(cleaned.additionalProperties).toBeUndefined();
    expect(cleaned.properties.query.minLength).toBeUndefined();
    expect(cleaned.properties.query.format).toBeUndefined();
    expect(cleaned.required).toEqual(["query"]);
  });

  it("converts const to enum", () => {
    const cleaned = cleanSchemaForGemini({
      type: "string",
      const: "fixed",
    }) as any;

    expect(cleaned.const).toBeUndefined();
    expect(cleaned.enum).toEqual(["fixed"]);
  });

  it("normalizes type arrays by removing null", () => {
    const cleaned = cleanSchemaForGemini({
      type: ["string", "null"],
    }) as any;

    expect(cleaned.type).toBe("string");
  });

  it("flattens anyOf literals into enum", () => {
    const cleaned = cleanSchemaForGemini({
      description: "mode",
      anyOf: [
        { type: "string", const: "a" },
        { type: "string", const: "b" },
      ],
    }) as any;

    expect(cleaned.type).toBe("string");
    expect(cleaned.enum).toEqual(["a", "b"]);
    expect(cleaned.description).toBe("mode");
  });

  it("resolves local refs via $defs", () => {
    const cleaned = cleanSchemaForGemini({
      $defs: {
        Query: {
          type: "object",
          additionalProperties: false,
          properties: {
            q: { type: "string", minLength: 1 },
          },
          required: ["q"],
        },
      },
      $ref: "#/$defs/Query",
      description: "resolved schema",
    }) as any;

    expect(cleaned.type).toBe("object");
    expect(cleaned.properties.q.type).toBe("string");
    expect(cleaned.properties.q.minLength).toBeUndefined();
    expect(cleaned.additionalProperties).toBeUndefined();
    expect(cleaned.description).toBe("resolved schema");
  });
});

describe("cleanToolSchemasForGeminiRequest", () => {
  it("cleans anthropic tools input_schema", () => {
    const cleaned = cleanToolSchemasForGeminiRequest({
      tools: [
        {
          name: "search",
          input_schema: {
            type: "object",
            additionalProperties: false,
            properties: { q: { type: "string", minLength: 1 } },
          },
        },
      ],
    }) as any;

    expect(cleaned.tools[0].input_schema.additionalProperties).toBeUndefined();
    expect(cleaned.tools[0].input_schema.properties.q.minLength).toBeUndefined();
  });

  it("cleans openai tools function.parameters", () => {
    const cleaned = cleanToolSchemasForGeminiRequest({
      tools: [
        {
          type: "function",
          function: {
            name: "search",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: { q: { type: "string", minLength: 1 } },
            },
          },
        },
      ],
    }) as any;

    expect(
      cleaned.tools[0].function.parameters.additionalProperties,
    ).toBeUndefined();
    expect(cleaned.tools[0].function.parameters.properties.q.minLength).toBeUndefined();
  });
});
