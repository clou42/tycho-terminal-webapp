import express from "express";
import path from "path";
import helmet from "helmet";
import expressLayouts from "express-ejs-layouts";
import routes from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";

const app = express();

app.use(helmet({ contentSecurityPolicy: false })); // enable & tune CSP if not demoing XSS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

app.set("views", path.join(process.cwd(), "views"));
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layouts/base");

app.use("/", routes);
app.use(notFound);
app.use(errorHandler);
app.use('/favicon.ico', express.static('public/favicon.ico'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tycho Station Terminal listening on http://localhost:${PORT}`));