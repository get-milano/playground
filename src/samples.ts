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
            "$expr": "$concat('Hello, ', context.userName)"
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

// A form with typed completions: the reason the playground can settle a
// dispatched action. Succeeding hands the document a confirmation it shows
// in the thank-you line; failing with one of the declared reasons hands it
// a `failure` the document turns into the message, without host UI code.
// Fail with a value outside the enum, or with none, and the engine reports
// an invalid completion instead of running either branch.
const CONTACT_FORM: Example = {
  key: "contact-form",
  title: "Form with a result and a failure payload",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.1.0",
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
      "result": "string",
      "failure": {"enum": ["invalidEmail", "unavailable"]}
    }
  }
}`,
  document: `{
  "version": "2.1.0",
  "state": {"email": "string", "confirmation": "string", "problem": "string"},
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
          "error": {"$expr": "$if(state.email == '' || $contains(state.email, '@'), null, 'That does not look like an email')"}
        },
        "on": {"change": [{"action": "$set", "key": "email", "value": {"$expr": "event"}}]}
      },
      {
        "type": "Button",
        "id": "submit",
        "properties": {
          "label": "Send",
          "enabled": {"$expr": "$contains(state.email, '@')"}
        },
        "on": {
          "tap": [{
            "action": "submitContact",
            "email": {"$expr": "state.email"},
            "onSuccess": [
              {"action": "$set", "key": "confirmation", "value": {"$expr": "result"}},
              {"action": "$set", "key": "problem", "value": ""}
            ],
            "onFailure": [
              {
                "action": "$set",
                "key": "problem",
                "value": {"$expr": "$if(failure == 'invalidEmail', 'That address was not accepted.', 'We could not reach the server. Try again in a moment.')"}
              }
            ]
          }]
        }
      },
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "$concat('Thanks. Your reference is ', state.confirmation)"},
          "role": "subtitle",
          "visible": {"$expr": "state.confirmation != ''"}
        }
      },
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "state.problem"},
          "role": "body",
          "visible": {"$expr": "state.problem != ''"}
        }
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "email": "",
  "confirmation": "",
  "problem": ""
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
          "text": {"$expr": "$concat('100 / divisor = ', $str(100 / state.divisor))"},
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

// A list from state: one `$repeat` over an array of records, keyed on the
// row's name so an instance keeps its reference (`line[Espresso]`, in the
// Occurrences and Analytics tabs) whatever position it lands in. The
// document is the template; the rows are data the State pane supplies.
// Each row's button dispatches a custom action carrying the element it was
// bound to, and the Clear button sets the array empty, so the list
// re-materializes. Give two rows the same name and the gate refuses the
// build: keys are distinct by rule.
const REPEAT_LIST: Example = {
  key: "repeat-list",
  title: "A keyed list from state",
  vocabulary: `{
  "milano": "2.1.0",
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
  "version": "2.1.0",
  "state": {
    "rows": {"array": {"record": {"name": "string", "price": "double"}}}
  },
  "root": {
    "type": "Column",
    "children": [
      {
        "type": "Text",
        "properties": {"text": {"$expr": "$concat($str($length(state.rows)), ' rows')"}}
      },
      {
        "type": "$repeat",
        "id": "rows",
        "items": {"$expr": "state.rows"},
        "as": "row",
        "key": {"$expr": "row.name"},
        "children": [
          {
            "type": "Row",
            "id": "line",
            "children": [
              {
                "type": "Text",
                "properties": {"text": {"$expr": "$concat($str(row_index + 1), '. ', row.name)"}}
              },
              {
                "type": "Text",
                "properties": {"text": {"$expr": "$concat($str(row.price), ' EUR')"}}
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

// Lifecycle bindings and the numeric functions, in one small calculator.
// The document's top-level `on` dispatches `track` when the view comes on
// screen and when it leaves (the snackbar shows the dispatch, with no
// node behind it), and the arithmetic rounds to cents with `round` and
// keeps the bill in range with `max` and `min`; the host ships no logic.
const LIFECYCLE_CALCULATOR: Example = {
  key: "lifecycle-calculator",
  title: "Lifecycle and numeric functions",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Row": {"children": true},
    "Text": {
      "properties": {
        "text": "string",
        "role": {"enum": ["title", "subtitle", "body"], "optional": true}
      }
    },
    "Button": {
      "properties": {"label": "string", "enabled": "bool"},
      "events": {"tap": null}
    }
  },
  "actions": {
    "track": {"parameters": {"event": {"enum": ["appeared", "disappeared"]}}}
  }
}`,
  document: `{
  "version": "2.1.0",
  "state": {"bill": "double", "percent": "int"},
  "on": {
    "appear": [{"action": "track", "event": "appeared"}],
    "disappear": [{"action": "track", "event": "disappeared"}]
  },
  "root": {
    "type": "Column",
    "children": [
      {"type": "Text", "properties": {"text": "Split the tip", "role": "title"}},
      {
        "type": "Text",
        "properties": {"text": {"$expr": "$concat('Bill: ', $str(state.bill), ' EUR')"}, "role": "subtitle"}
      },
      {
        "type": "Row",
        "children": [
          {
            "type": "Button",
            "id": "less",
            "properties": {"label": "- 10", "enabled": {"$expr": "state.bill > 0.0"}},
            "on": {"tap": [{"action": "$set", "key": "bill", "value": {"$expr": "$max(state.bill - 10.0, 0.0)"}}]}
          },
          {
            "type": "Button",
            "id": "more",
            "properties": {"label": "+ 10", "enabled": {"$expr": "state.bill < 500.0"}},
            "on": {"tap": [{"action": "$set", "key": "bill", "value": {"$expr": "$min(state.bill + 10.0, 500.0)"}}]}
          }
        ]
      },
      {
        "type": "Row",
        "children": [
          {
            "type": "Button",
            "id": "ten",
            "properties": {"label": "10%", "enabled": {"$expr": "state.percent != 10"}},
            "on": {"tap": [{"action": "$set", "key": "percent", "value": 10}]}
          },
          {
            "type": "Button",
            "id": "fifteen",
            "properties": {"label": "15%", "enabled": {"$expr": "state.percent != 15"}},
            "on": {"tap": [{"action": "$set", "key": "percent", "value": 15}]}
          },
          {
            "type": "Button",
            "id": "twenty",
            "properties": {"label": "20%", "enabled": {"$expr": "state.percent != 20"}},
            "on": {"tap": [{"action": "$set", "key": "percent", "value": 20}]}
          }
        ]
      },
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "$concat('Tip: ', $str($round(state.bill * $double(state.percent)) / 100.0), ' EUR')"},
          "role": "body"
        }
      },
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "$concat('Total: ', $str($round(state.bill * (100.0 + $double(state.percent))) / 100.0), ' EUR')"},
          "role": "body"
        }
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "bill": 47.3,
  "percent": 15
}`,
  actions: `{}`
};

// A list the document edits in place with the array actions, a watch
// that clears the draft whenever the list changes, and two host functions
// the playground answers (`formatMoney` in the browser's locale, and
// `plural`). Type a name and add it; toggle and remove rows. Then edit the
// document while the list is filled: the playground replaces the document
// on the live view, so the rows you added survive the edit.
const SHOPPING_LIST: Example = {
  key: "shopping-list",
  title: "A list edited in place",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.2.0",
  "components": {
    "Column": {"children": true},
    "Row": {"children": true},
    "Text": {
      "properties": {
        "text": "string",
        "role": {"enum": ["title", "subtitle", "body"], "optional": true}
      }
    },
    "TextField": {
      "properties": {"label": "string", "value": "string", "error": "string?"},
      "events": {"change": "string"}
    },
    "Checkbox": {
      "properties": {"label": "string", "checked": "bool"},
      "events": {"change": "bool"}
    },
    "Button": {
      "properties": {"label": "string", "enabled": "bool"},
      "events": {"tap": null}
    }
  },
  "actions": {},
  "functions": {
    "formatMoney": {"arguments": ["double", "string"], "returns": "string"},
    "plural": {"arguments": ["int", "string", "string"], "returns": "string"}
  }
}`,
  document: `{
  "version": "2.1.0",
  "state": {
    "items": {"array": {"record": {"name": "string", "price": "double", "done": "bool"}}},
    "draft": "string"
  },
  "watch": {
    "items": [
      {"action": "$set", "key": "draft", "value": ""}
    ]
  },
  "root": {
    "type": "Column",
    "children": [
      {"type": "Text", "properties": {"text": "Shopping list", "role": "title"}},
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "$concat($str($length(state.items)), ' ', plural($length(state.items), 'item', 'items'), ' on the list')"},
          "role": "subtitle"
        }
      },
      {
        "type": "Row",
        "children": [
          {
            "type": "TextField",
            "id": "draft",
            "properties": {"label": "Add an item", "value": {"$expr": "state.draft"}},
            "on": {"change": [{"action": "$set", "key": "draft", "value": {"$expr": "event"}}]}
          },
          {
            "type": "Button",
            "id": "add",
            "properties": {"label": "Add", "enabled": {"$expr": "!$isEmpty($trim(state.draft))"}},
            "on": {
              "tap": [
                {"action": "$append", "key": "items", "value": {"name": "", "price": 2.5, "done": false}},
                {"action": "$update", "key": "items", "at": {"$expr": "$length(state.items) - 1"}, "field": "name", "value": {"$expr": "$trim(state.draft)"}}
              ]
            }
          }
        ]
      },
      {
        "type": "$repeat",
        "id": "rows",
        "items": {"$expr": "state.items"},
        "as": "item",
        "key": {"$expr": "item.name"},
        "children": [
          {
            "type": "Row",
            "id": "line",
            "children": [
              {
                "type": "Checkbox",
                "id": "done",
                "properties": {"label": {"$expr": "$concat(item.name, ' (', formatMoney(item.price, 'EUR'), ')')"}, "checked": {"$expr": "item.done"}},
                "on": {"change": [{"action": "$update", "key": "items", "at": {"$expr": "item_index"}, "field": "done", "value": {"$expr": "event"}}]}
              },
              {
                "type": "Button",
                "id": "remove",
                "properties": {"label": "Remove", "enabled": true},
                "on": {"tap": [{"action": "$remove", "key": "items", "at": {"$expr": "item_index"}}]}
              }
            ]
          }
        ]
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "items": [
    {"name": "Espresso", "price": 1.5, "done": false},
    {"name": "Cornetto", "price": 1.2, "done": true}
  ],
  "draft": ""
}`,
  actions: `{}`
};

export const EXAMPLES: Example[] = [
  CONSENT_BANNER,
  CONTACT_FORM,
  GUARDRAILS,
  REPEAT_LIST,
  LIFECYCLE_CALCULATOR,
  SHOPPING_LIST
];
