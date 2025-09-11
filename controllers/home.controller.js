export async function getHome(req, res) {
  res.render("pages/home", {
    title: "Tycho Station Terminal",
    tagline: "Interact with ships, query crew manifests, and monitor incidents across the Belt.",
  });
}