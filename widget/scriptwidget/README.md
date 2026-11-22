# Coinio for ScriptWidget

[ScriptWidget](https://github.com/everettjf/scriptwidget) runs JavaScript widgets on iPhone, iPad, Mac, Android and Linux. `coinio/` is a ScriptWidget package that shows what is left to pay this month and your next payments.

## Free hosted Coinio (app.getcoinio.me)

1. In Coinio, open **Settings › Integrations › API keys** and create a **Read only** key.
2. Add the Coinio widget from ScriptWidget's Gallery (or import this folder).
3. Put the key in the widget's parameter: `coi_read_…`

## Your own Coinio server

ScriptWidget only lets a widget reach the hosts it declares, so:

1. Remix the widget and add your host to `networkDomains` in `widget.json`, for example `"coinio.example.com"`.
2. Write the address, a space and the key in the widget parameter: `https://coinio.example.com coi_read_…`

The address must be reachable over the internet; ScriptWidget does not allow private network addresses.

The widget only reads `GET /api/widget`. A read-only key cannot change anything.
