# Mini-Me 0.5.3

## New

- Each Conversation in the sidebar, and in Home's Recent list, now shows when a reply is running or waiting for your approval, with the avatar of the Mini-Me working on it, so you can tell without opening it.
- A "What's new" page tells you what changed, once after Mini-Me updates. You can open it again from Settings → About, next to the version.
- A **Test model** button in Settings → Models & keys checks that the model you typed works with Mini-Me, before you use it.
- Settings has a **Developer** page, shown only while Developer mode is on, with the options for testing Mini-Me.

## Improved

- When a tool panel such as Comments or Jobs opens in a small window, the sidebar shrinks to a strip of icons to leave room for your Conversation, and comes back when the panel closes.
- Mini-Me works with more AI models: some, such as certain Claude models through OpenRouter, refuse to be forced to use a tool, and it no longer fails on them.
- Messages about AI model problems are clearer: they now say when a model cannot use tools, or when a Conversation is too long for it.
- Charts with a lot of data are built faster.
- Document previews are quicker to refresh.
- Duplicating a file more than once gives each copy its own name, such as "report copy 2.csv".
- The "…" button of a Conversation no longer overlaps a long title, its row stays highlighted while you use it, and the dots turn lighter when you point at them. The Outline, Jobs and Report buttons have new icons.
- In Settings, **Test model** and Quarto's **Check again** are icon buttons, and the test result opens in a small box next to the button.
- The Render button's icon now spins while a document renders.
- Your name is now kept in Mini-Me's settings folder, not in Documents, and your own Mini-Mes and Traits are saved in a file called `library.json`. After updating, enter your name again in Settings → General. If you made your own Mini-Mes or Traits, rename `user-library.json` to `library.json` in your Mini-Me Data folder.

## Fixed

- Deleting a Project while a reply is still running no longer fails partway: Mini-Me waits for the reply to stop first.
- A document that takes too long to render now stops everything it started, so repeated previews no longer pile up.
- Temporary files left by a render that was interrupted are cleaned up when you open the Project.
