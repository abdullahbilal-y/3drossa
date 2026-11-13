import { createSaveRoute } from "3drossa/next";

// Dev-only: the editor overlay posts the edited document here and this
// writes it back to the file the page imports. HMR does the rest.
//
// Two Next constraints are load-bearing here:
//   - the folder must NOT start with an underscore. Next treats _folder as a
//     private implementation detail and excludes it from routing entirely, so
//     an /_rossa/save route silently never exists.
//   - POST must be a plain named export. Destructuring it straight out of the
//     factory is not always picked up by static analysis.
const route = createSaveRoute({ file: "app/journey.json" });

export const POST = route.POST;
