# Website releases

The repository stores source code. The server retains the database, runtime data,
environment settings and shared dependencies. None of those are uploaded to Git.

1. Push a branch and open a pull request. `Verify project` checks the code.
2. Merge the reviewed changes into `main`.
3. A push to `main` starts **Deploy website** automatically. A manual **Run
   workflow** on `main` can also retry a reviewed release.
4. The workflow verifies, builds and sends a checksummed release to the server.
   Failed service/health checks restore the previous release. Pending database
   migrations stop the deployment before activation and need a separate reviewed
   migration with a backup.

Deployment configuration comes from the locally ignored `data1.yml`. Its build
commands and restricted SSH credentials are provisioned as GitHub secrets. The
server-owned receiver and configuration are installed separately; a website
archive cannot overwrite them. SSH host keys are verified, not accepted on trust.
Receiver/preflight updates therefore need a separately authorized installation
on the server. Their diagnostics report only an allowlisted phase and error code;
raw database errors and credentials remain private.

Only the current and previous successful GitHub releases are retained. Legacy
release directories require a one-time dependency/data audit before removal.
Database backups have an independent retention policy.

## Native apps

Website deployment never uploads a mobile application. The existing **iOS Build
and TestFlight** workflow builds iOS; its publish option uploads a signed build to
TestFlight. **Submit iOS app to App Store Review** is a separate operation.
Android signed APK/AAB builds currently use `scripts/build-android-release.ps1`.
Android store publication is not configured by the website workflow. Both native
apps retain their existing identifiers and API endpoints. Changes bundled inside
the apps can arrive through the separate signed **OTA web updates** workflow when
the installed native runtime matches the approved `OTA_NATIVE_RUNTIME` and
`OTA_ENABLED=true`. Native plugin, permission and runtime changes require new
native builds and the appropriate store release. See `scripts/ota/README.md` for
device checks and approval; a website deployment alone does not publish an OTA.
