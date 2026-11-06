# Mini-Me 0.6.1

## New

- **CIP's Archivist** finds datasets in CIP's Dataverse and downloads the files you choose into your Project.
- The Project summary on the Overview now shows the files, tables and charts it mentions as pills: click a file to open it, or a table or chart to go to the reply that shows it.
- The composer has a button to reference a table or chart of the Conversation, next to the one for files, and the `#` list shows more about each file.
- **Feature flags** let experimental features ship turned off and be turned on with a key, in Settings → Developer → Feature flags, so they can be tried before everyone gets them.
- Mini-Me is now free software under the GNU General Public License, version 3 or later. Settings → About lists the third-party software it is built with, and their licenses, under **Third-party Software**.

## Improved

- When you ask about a table or a chart, Mini-Me now finds the file it came from, so the data Mini-Mes work on the right data.
- Asking Plotter for another kind of chart, such as "make that a bar chart", now works without naming the columns again.
- Dates, sizes and other details are shown only where they help, and read more clearly.
- The Developer page has new options to see what Jev was asked and answered, and what the AI read, which model answered and which tools it used for each reply.

## Fixed

- A file just downloaded from Dataverse no longer shows as "(Deleted)" when you reference it with `#`, and the file count updates straight away.
- The **Restart** button can no longer be clicked twice while an update installs.
