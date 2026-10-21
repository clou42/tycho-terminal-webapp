# tycho-terminal-webapp

An intentionally vulnerable Expanse-themed web app for the isolated Expanse
Azure Security Lab. Deploy only in a dedicated test tenant.

## Docking Dispatch

`/docking` now records telemetry jobs, sends them to an Azure Storage Queue,
and shows the queue worker's results. The worker uses a separate managed
identity whose Run Command role is scoped to Rocinante and Scopuli. It is
packaged and deployed by the sibling `ExpanseAzureLab` repository.

The request-to-worker trust boundary is intentionally flawed for the CTF.
Keep the docking resources and the web app inside the lab's existing IP
restriction and do not reuse the worker identity in other environments.

For local UI development, omit `DOCKING_QUEUE_ACCOUNT`; jobs use SQLite and
complete with a simulated result. In Azure, Terraform sets `DOCKING_MODE=azure`,
the queue account and queue names. The web app's managed identity uses Azure
Queue Storage REST with `Storage Queue Data Contributor` on the dedicated bus.

After editing this source, run `../ExpanseAzureLab/build_tycho_package.sh` to
refresh the bundled release ZIP before applying Terraform.
