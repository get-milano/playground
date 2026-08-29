// The starter scenario: a consent banner. Everything renders over the
// image: an expression greeting, a consent checkbox that gates the Open
// button, and a Row with the two actions side by side.

export interface Example {
  key: string;
  title: string;
  vocabulary: string;
  document: string;
  context: string;
  state: string;
  actions: string;
}

const CONSENT_BANNER: Example = {
  key: "consent-banner",
  title: "Consent banner",
  vocabulary: `{
  "milano": "1.0.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Row": {
      "children": true
    },
    "Text": {
      "properties": {
        "text": "string",
        "role": {"enum": ["title", "subtitle", "body"], "optional": true}
      }
    },
    "Banner": {
      "properties": {
        "backgroundImageUrl": "string?",
        "layout": {"enum": ["overlay", "card", "strip"], "optional": true},
        "height": "int?",
        "showScrim": "bool?",
        "cornerRadius": "int?"
      },
      "children": true
    },
    "Button": {
      "properties": {
        "label": "string",
        "enabled": "bool"
      },
      "events": {
        "tap": null
      }
    },
    "Checkbox": {
      "properties": {
        "label": "string",
        "checked": "bool"
      },
      "events": {
        "change": "bool"
      }
    }
  },
  "actions": {
    "openUrl": {
      "parameters": {
        "url": "string"
      }
    },
    "dismiss": {
      "parameters": {
        "reason": "string?"
      }
    }
  }
}`,
  document: `{
  "version": "1.0.0",
  "context": {
    "userName": "string",
    "url": "string"
  },
  "state": {
    "accepted": "bool"
  },
  "root": {
    "type": "Banner",
    "id": "banner",
    "properties": {
      "backgroundImageUrl": "https://picsum.photos/seed/milano/900/500",
      "layout": "card",
      "height": 280,
      "showScrim": true,
      "cornerRadius": 16
    },
    "children": [
      {
        "type": "Text",
        "id": "title",
        "properties": {
          "text": {
            "$expr": "concat('Hello, ', context.userName)"
          },
          "role": "title"
        }
      },
      {
        "type": "Text",
        "id": "subtitle",
        "properties": {
          "text": "A summer of savings starts today.",
          "role": "subtitle"
        }
      },
      {
        "type": "Checkbox",
        "id": "consent",
        "properties": {
          "label": "Take me to the offer in the browser",
          "checked": {
            "$expr": "state.accepted"
          }
        },
        "on": {
          "change": [
            {
              "action": "$set",
              "key": "accepted",
              "value": {
                "$expr": "event"
              }
            }
          ]
        }
      },
      {
        "type": "Row",
        "id": "actions",
        "children": [
          {
            "type": "Button",
            "id": "open",
            "properties": {
              "label": "Open",
              "enabled": {
                "$expr": "state.accepted"
              }
            },
            "on": {
              "tap": [
                {
                  "action": "openUrl",
                  "url": {
                    "$expr": "context.url"
                  }
                }
              ]
            }
          },
          {
            "type": "Button",
            "id": "dismiss",
            "properties": {
              "label": "Dismiss",
              "enabled": true
            },
            "on": {
              "tap": [
                {
                  "action": "dismiss",
                  "reason": "closed-by-user"
                }
              ]
            }
          }
        ]
      }
    ]
  }
}`,
  context: `{
  "userName": "Ada",
  "url": "https://get-milano.dev"
}`,
  state: `{
  "accepted": false
}`,
  actions: `{
  "allow": ["openUrl", "dismiss"],
  "declare": {
    "dismiss": {
      "parameters": {
        "reason": "string"
      }
    }
  }
}`
};

// A form with a typed completion result: the reason the playground can
// settle a dispatched action. Submitting hands the host a value, and the
// document shows it in the thank-you line without any host UI code.
const CONTACT_FORM: Example = {
  key: "contact-form",
  title: "Form with a completion result",
  vocabulary: `{
  "milano": "1.0.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Text": {
      "properties": {
        "text": "string",
        "role": {"enum": ["title", "subtitle", "body"], "optional": true},
        "visible": "bool?"
      }
    },
    "TextField": {
      "properties": {"label": "string", "value": "string", "error": "string?"},
      "events": {"change": "string"}
    },
    "Button": {
      "properties": {"label": "string", "enabled": "bool"},
      "events": {"tap": null}
    }
  },
  "actions": {
    "submitContact": {
      "parameters": {"email": "string"},
      "result": "string"
    }
  }
}`,
  document: `{
  "version": "1.0.0",
  "state": {"email": "string", "confirmation": "string"},
  "root": {
    "type": "Column",
    "children": [
      {"type": "Text", "properties": {"text": "Stay in touch", "role": "title"}},
      {
        "type": "TextField",
        "id": "email",
        "properties": {
          "label": "Email",
          "value": {"$expr": "state.email"},
          "error": {"$expr": "if(state.email == '' || contains(state.email, '@'), null, 'That does not look like an email')"}
        },
        "on": {"change": [{"action": "$set", "key": "email", "value": {"$expr": "event"}}]}
      },
      {
        "type": "Button",
        "id": "submit",
        "properties": {
          "label": "Send",
          "enabled": {"$expr": "contains(state.email, '@')"}
        },
        "on": {
          "tap": [{
            "action": "submitContact",
            "email": {"$expr": "state.email"},
            "onSuccess": [{"action": "$set", "key": "confirmation", "value": {"$expr": "result"}}],
            "onFailure": [{"action": "$set", "key": "confirmation", "value": "Could not send it"}]
          }]
        }
      },
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "concat('Thanks. Your reference is ', state.confirmation)"},
          "role": "subtitle",
          "visible": {"$expr": "state.confirmation != ''"}
        }
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "email": "",
  "confirmation": ""
}`,
  actions: `{}`
};

// Everything the guardrails report, in one document: an event with no
// binding, a property the component never declared, and arithmetic that
// divides by zero. It builds, and the Occurrences tab fills up.
const GUARDRAILS: Example = {
  key: "guardrails",
  title: "Guardrails and occurrences",
  vocabulary: `{
  "milano": "1.0.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Text": {"properties": {"text": "string"}},
    "Button": {
      "properties": {"label": "string"},
      "events": {"tap": null}
    }
  },
  "actions": {}
}`,
  document: `{
  "version": "1.0.0",
  "state": {"divisor": "int"},
  "root": {
    "type": "Column",
    "children": [
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "concat('100 / divisor = ', str(100 / state.divisor))"},
          "colour": "undeclared properties are reported, not fatal"
        }
      },
      {
        "type": "Button",
        "id": "unbound",
        "properties": {"label": "Tap me: nothing is bound"}
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "divisor": 0
}`,
  actions: `{}`
};

// A list from state: one `$repeat` over an array of records. The document
// is the template; the rows are data the State pane supplies. Each row's
// button dispatches a custom action carrying the element it was bound to,
// and the Clear button sets the array empty, so the list re-materializes.
const REPEAT_LIST: Example = {
  key: "repeat-list",
  title: "A list from state",
  vocabulary: `{
  "milano": "2.0.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Row": {"children": true},
    "Text": {"properties": {"text": "string"}},
    "Button": {
      "properties": {"label": "string"},
      "events": {"tap": null}
    }
  },
  "actions": {
    "select": {"parameters": {"name": "string", "position": "int"}}
  }
}`,
  document: `{
  "version": "2.0.0",
  "state": {
    "rows": {"array": {"record": {"name": "string", "price": "double"}}}
  },
  "root": {
    "type": "Column",
    "children": [
      {
        "type": "Text",
        "properties": {"text": {"$expr": "concat(str(length(state.rows)), ' rows')"}}
      },
      {
        "type": "$repeat",
        "id": "rows",
        "items": {"$expr": "state.rows"},
        "as": "row",
        "children": [
          {
            "type": "Row",
            "id": "line",
            "children": [
              {
                "type": "Text",
                "properties": {"text": {"$expr": "concat(str(row_index + 1), '. ', row.name)"}}
              },
              {
                "type": "Text",
                "properties": {"text": {"$expr": "concat(str(row.price), ' EUR')"}}
              },
              {
                "type": "Button",
                "id": "pick",
                "properties": {"label": "Select"},
                "on": {
                  "tap": [
                    {"action": "select", "name": {"$expr": "row.name"}, "position": {"$expr": "row_index"}}
                  ]
                }
              }
            ]
          }
        ]
      },
      {
        "type": "Button",
        "id": "clear",
        "properties": {"label": "Clear the list"},
        "on": {"tap": [{"action": "$set", "key": "rows", "value": []}]}
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "rows": [
    {"name": "Espresso", "price": 1.5},
    {"name": "Cappuccino", "price": 2.8},
    {"name": "Cornetto", "price": 1.2}
  ]
}`,
  actions: `{}`
};

export const EXAMPLES: Example[] = [CONSENT_BANNER, CONTACT_FORM, GUARDRAILS, REPEAT_LIST];
