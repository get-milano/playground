// The starter scenario: a consent banner. Everything renders over the
// image: an expression greeting, a consent checkbox that gates the Open
// button, and a Row with the two actions side by side.

export interface Example {
  key: string;
  title: string;
  /** The dropdown section the example sits under. */
  group: string;
  /** One or two sentences: what it shows and what to try. */
  description: string;
  /** Where to read about the mechanic this example demonstrates. */
  docsUrl: string;
  vocabulary: string;
  document: string;
  context: string;
  state: string;
  actions: string;
}

const CONSENT_BANNER: Example = {
  key: "consent-banner",
  title: "Consent banner",
  group: "Start here",
  description:
    "A consent banner over an image: an expression greeting from context, a checkbox gating the Open button, and two actions side by side. Tick the box and tap Open to see a dispatched action arrive.",
  docsUrl: "https://get-milano.dev/specs/examples.html#the-banner",
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
    },
    "Image": {
      "properties": {
        "url": "string",
        "width": "int?",
        "height": "int?",
        "cornerRadius": "int?",
        "contentDescription": "string?"
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
      "backgroundImageUrl": "https://images.unsplash.com/photo-1520440229-6469a149ac59?w=900&q=60",
      "layout": "card",
      "height": 280,
      "showScrim": true,
      "cornerRadius": 16
    },
    "children": [
      {
        "type": "Image",
        "id": "artwork",
        "properties": {
          "url": "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=200&q=60",
          "width": 56,
          "height": 56,
          "cornerRadius": 12,
          "contentDescription": "Summer offer artwork"
        }
      },
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
  group: "State and actions",
  description:
    "A form with typed completions: Succeed hands the document a confirmation it shows, and Fail with one of the declared reasons becomes the message, with no host UI code. Fail with a value outside the enum and the engine reports an invalid completion instead.",
  docsUrl: "https://get-milano.dev/sdk/documents#failure-payloads",
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
  group: "Guardrails",
  description:
    "Everything the guardrails report in one document: an event with no binding, a property the component never declared, and a division by zero. It builds, and the Occurrences tab fills up.",
  docsUrl: "https://get-milano.dev/sdk/guardrails",
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
  group: "Constructs and strings",
  description:
    "A keyed $repeat over rows from state: the document is the template, the rows are data. Each button dispatches the element it was bound to; give two rows the same name and the gate refuses the build, since keys are distinct by rule.",
  docsUrl: "https://get-milano.dev/sdk/documents#lists-with-repeat",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Row": {
      "children": true,
      "properties": {"justify": {"enum": ["start", "center", "end", "spaceBetween"], "optional": true}}
    },
    "Text": {
      "properties": {
        "text": "string",
        "role": {"enum": ["title", "subtitle", "body", "caption"], "optional": true}
      }
    },
    "Button": {
      "properties": {"label": "string", "role": {"enum": ["primary", "secondary", "tertiary"], "optional": true}},
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
      {"type": "Text", "properties": {"text": "Menu", "role": "title"}},
      {
        "type": "Text",
        "properties": {"text": {"$expr": "$concat($str($length(state.rows)), ' rows')"}, "role": "subtitle"}
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
            "properties": {"justify": "spaceBetween"},
            "children": [
              {
                "type": "Text",
                "properties": {"text": {"$expr": "$concat($str(row_index + 1), '. ', row.name)"}}
              },
              {
                "type": "Text",
                "properties": {"text": {"$expr": "$concat($str(row.price), ' EUR')"}, "role": "caption"}
              },
              {
                "type": "Button",
                "id": "pick",
                "properties": {"label": "Select", "role": "secondary"},
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
        "properties": {"label": "Clear the list", "role": "tertiary"},
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
  group: "State and actions",
  description:
    "Lifecycle bindings and the numeric functions in a small tip calculator: the document's own on section dispatches track on appear and disappear, and round, min, and max keep the arithmetic in range with no host logic.",
  docsUrl: "https://get-milano.dev/sdk/documents#lifecycle",
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
      "properties": {"label": "string", "enabled": "bool", "role": {"enum": ["primary", "secondary", "tertiary"], "optional": true}},
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
            "properties": {"label": "- 10", "role": "secondary", "enabled": {"$expr": "state.bill > 0.0"}},
            "on": {"tap": [{"action": "$set", "key": "bill", "value": {"$expr": "$max(state.bill - 10.0, 0.0)"}}]}
          },
          {
            "type": "Button",
            "id": "more",
            "properties": {"label": "+ 10", "role": "secondary", "enabled": {"$expr": "state.bill < 500.0"}},
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
            "properties": {"label": "10%", "role": "secondary", "enabled": {"$expr": "state.percent != 10"}},
            "on": {"tap": [{"action": "$set", "key": "percent", "value": 10}]}
          },
          {
            "type": "Button",
            "id": "fifteen",
            "properties": {"label": "15%", "role": "secondary", "enabled": {"$expr": "state.percent != 15"}},
            "on": {"tap": [{"action": "$set", "key": "percent", "value": 15}]}
          },
          {
            "type": "Button",
            "id": "twenty",
            "properties": {"label": "20%", "role": "secondary", "enabled": {"$expr": "state.percent != 20"}},
            "on": {"tap": [{"action": "$set", "key": "percent", "value": 20}]}
          }
        ]
      },
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "$concat('Tip: ', $str($round(state.bill * $double(state.percent)) / 100.0), ' EUR')"},
          "role": "subtitle"
        }
      },
      {
        "type": "Text",
        "properties": {
          "text": {"$expr": "$concat('Total: ', $str($round(state.bill * (100.0 + $double(state.percent))) / 100.0), ' EUR')"},
          "role": "title"
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
  group: "State and actions",
  description:
    "A list the document edits in place with the array actions, a watch that clears the draft, and two host functions the playground answers. Fill the list, then edit the document: it is replaced on the live view and your rows survive.",
  docsUrl: "https://get-milano.dev/sdk/documents#watch",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.2.0",
  "components": {
    "Column": {"children": true},
    "Row": {
      "children": true,
      "properties": {"justify": {"enum": ["start", "center", "end", "spaceBetween"], "optional": true}}
    },
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
      "properties": {"label": "string", "enabled": "bool", "role": {"enum": ["primary", "secondary", "tertiary"], "optional": true}},
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
            "properties": {"justify": "spaceBetween"},
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
                "properties": {"label": "Remove", "enabled": true, "role": "tertiary"},
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

// The $if construct (contract 2.1): a bool expression chooses which branch
// of the document materializes. The branch not taken is validated at the
// gate but never resolved, so flipping the box replaces the subtree rather
// than hiding it.
const CONDITIONAL_BRANCH: Example = {
  key: "conditional-branch",
  title: "One branch or the other ($if)",
  group: "Constructs and strings",
  description:
    "The $if construct: a bool expression chooses which branch materializes. Tick the box and the subtree is replaced, not hidden; the branch not taken is still validated.",
  docsUrl: "https://get-milano.dev/sdk/documents#choosing-a-subtree-with-if",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Text": {"properties": {"text": "string"}},
    "Checkbox": {
      "properties": {"label": "string", "checked": "bool"},
      "events": {"change": "bool"}
    }
  },
  "actions": {}
}`,
  document: `{
  "version": "2.1.0",
  "state": {"signedIn": "bool"},
  "root": {
    "type": "Column",
    "children": [
      {
        "type": "Checkbox",
        "properties": {
          "label": "Signed in",
          "checked": {"$expr": "state.signedIn"}
        },
        "on": {
          "change": [{"action": "$set", "key": "signedIn", "value": {"$expr": "event"}}]
        }
      },
      {
        "type": "$if",
        "condition": {"$expr": "state.signedIn"},
        "then": [{"type": "Text", "properties": {"text": "Welcome back."}}],
        "else": [{"type": "Text", "properties": {"text": "Please sign in."}}]
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "signedIn": false
}`,
  actions: `{}`
};

// The $switch construct (contract 2.1): one branch per member of an enum,
// with a `default` covering the rest. A member that neither a case nor the
// default covers fails the build, rather than rendering nothing; drop the
// default here and "failed" is exactly that violation. Edit "status" in
// the "State values" pane to move between the branches.
const SWITCH_BRANCH: Example = {
  key: "switch-branch",
  title: "A branch per member ($switch)",
  group: "Constructs and strings",
  description:
    "The $switch construct: one branch per member of an enum, a default for the rest. Edit the status key in the State values pane to move between branches; drop the default from the document and the uncovered member becomes a build error.",
  docsUrl: "https://get-milano.dev/sdk/documents#choosing-among-many-with-switch",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Badge": {
      "properties": {
        "text": "string",
        "tone": {"enum": ["info", "success", "warning", "danger"], "optional": true}
      }
    }
  },
  "actions": {}
}`,
  document: `{
  "version": "2.1.0",
  "state": {"status": {"enum": ["ok", "late", "failed"]}},
  "root": {
    "type": "Column",
    "children": [
      {
        "type": "$switch",
        "subject": {"$expr": "state.status"},
        "cases": {
          "ok": [{"type": "Badge", "properties": {"text": "On time", "tone": "success"}}],
          "late": [{"type": "Badge", "properties": {"text": "Running late", "tone": "warning"}}]
        },
        "default": [{"type": "Badge", "properties": {"text": "Needs attention", "tone": "danger"}}]
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "status": "late"
}`,
  actions: `{}`
};

// $substring with $length (contract 2.1): the last four characters kept,
// the rest masked, computed in the document. Type in the field and the
// mask follows; no host code formats anything. Indices are clamped, so a
// number shorter than four characters is still a total expression.
const MASKED_CARD: Example = {
  key: "masked-card",
  title: "Mask all but the last four ($substring)",
  group: "Constructs and strings",
  description:
    "$substring and $length masking all but the last four characters. Type in the field and the mask follows; indices clamp, so a short number is still a total expression.",
  docsUrl: "https://get-milano.dev/specs/03-expression-language.html#strings",
  vocabulary: `{
  "milano": "2.1.0",
  "name": "starter",
  "version": "1.0.0",
  "components": {
    "Column": {"children": true},
    "Text": {
      "properties": {
        "text": "string",
        "role": {"enum": ["title", "subtitle", "body", "caption"], "optional": true}
      }
    },
    "TextField": {
      "properties": {"label": "string", "value": "string"},
      "events": {"change": "string"}
    }
  },
  "actions": {}
}`,
  document: `{
  "version": "2.1.0",
  "state": {"card": "string"},
  "root": {
    "type": "Column",
    "children": [
      {
        "type": "TextField",
        "properties": {
          "label": "Card number",
          "value": {"$expr": "state.card"}
        },
        "on": {
          "change": [{"action": "$set", "key": "card", "value": {"$expr": "event"}}]
        }
      },
      {
        "type": "Text",
        "properties": {
          "text": {
            "$expr": "$concat('\u2022\u2022\u2022\u2022 ', $substring(state.card, $length(state.card) - 4, $length(state.card)))"
          },
          "role": "title"
        }
      }
    ]
  }
}`,
  context: `{}`,
  state: `{
  "card": "4111111111111111"
}`,
  actions: `{}`
};

export const EXAMPLES: Example[] = [
  CONSENT_BANNER,
  CONTACT_FORM,
  GUARDRAILS,
  REPEAT_LIST,
  CONDITIONAL_BRANCH,
  SWITCH_BRANCH,
  MASKED_CARD,
  LIFECYCLE_CALCULATOR,
  SHOPPING_LIST
];
