# iPhone widget (Scriptable)

Home Screen (small, medium, large) and Lock Screen (inline and rectangular) widgets, free, without an App Store app.

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) from the App Store.
2. In the web app, open **Settings › API keys** and create a **Read only** key. Copy it.
3. In Scriptable, tap **+**, paste `coinio-widget.js`, and fill in the two lines at the top:
   `SERVER_URL` (the address you open the app at) and `API_KEY`.
4. Long-press the Home Screen (or Lock Screen › Customize), add a **Scriptable** widget, tap it and choose the script.

The widget refreshes about every 30 minutes. Without a connection it shows the last data it saw and marks it *offline*.
Overdue payments are red on the Home Screen and marked ⚠ on the Lock Screen, which is drawn in one colour.
