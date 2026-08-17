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

export const EXAMPLES: Example[] = [CONSENT_BANNER];
