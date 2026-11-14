import { createSaveRoute } from "3drossa/next";

// Dev-only: the editor posts a dropped .glb here and this writes it into the
// repository under public/models, then answers with the URL the document
// records. That is what makes dropping a model a complete action rather than a
// preview that vanishes on the next reload.
//
// Same two Next constraints as the document route: the folder must not start
// with an underscore, and POST must be a plain named export.
const route = createSaveRoute({ file: "app/journey.json" });

export const POST = route.PUT_ASSET;
