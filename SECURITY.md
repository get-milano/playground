# Security policy

The playground is a static page that runs the published Milano engine in
your browser. It has no backend, stores nothing, and sends nothing
anywhere: what you type stays in the tab, and a shared link carries the
state in the URL fragment, which browsers do not transmit to servers.

A vulnerability in the engine itself belongs in
[get-milano/sdk](https://github.com/get-milano/sdk/security). Report
problems with this page (a way to make it execute something a document
should not, or to leak state between tabs) through this repository's
**Security** tab, then **Report a vulnerability**. Please do not open a
public issue for a suspected vulnerability.
