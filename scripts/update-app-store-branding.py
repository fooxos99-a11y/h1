import json
import os
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError

import jwt


API_ROOT = "https://api.appstoreconnect.apple.com/v1"


def request_json(path, token, method="GET", payload=None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        f"{API_ROOT}{path}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status == 204:
                return None
            return json.load(response)
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"App Store Connect returned HTTP {error.code}: {details}"
        ) from error


def main():
    key_id = os.environ["APPSTORE_API_KEY_ID"]
    issuer_id = os.environ["APPSTORE_ISSUER_ID"]
    private_key = os.environ["APPSTORE_API_PRIVATE_KEY"]
    bundle_id = os.environ["APP_IDENTIFIER"]
    app_name = os.environ["APP_NAME"].strip()
    version_string = os.environ.get("APP_VERSION", "").strip()
    arabic_description = os.environ.get("APP_DESCRIPTION_AR", "").strip()
    english_description = os.environ.get("APP_DESCRIPTION_EN", "").strip()
    if not app_name or len(app_name) > 30:
        raise RuntimeError("APP_NAME must contain between 1 and 30 characters")
    if max(len(arabic_description), len(english_description)) > 4000:
        raise RuntimeError("App Store descriptions must not exceed 4000 characters")

    now = int(time.time())
    token = jwt.encode(
        {"iss": issuer_id, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        private_key,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )

    app_query = urllib.parse.urlencode({"filter[bundleId]": bundle_id, "limit": 1})
    apps = request_json(f"/apps?{app_query}", token).get("data", [])
    if not apps:
        raise RuntimeError(f"App not found for bundle ID {bundle_id}")

    app_id = apps[0]["id"]
    app_infos = request_json(f"/apps/{app_id}/appInfos?limit=10", token).get("data", [])
    if not app_infos:
        raise RuntimeError(f"No App Store app info found for bundle ID {bundle_id}")

    updated = 0
    update_errors = []
    for app_info in app_infos:
        print(
            "App info state: "
            + json.dumps(app_info.get("attributes", {}), ensure_ascii=False)
        )
        localizations = request_json(
            f"/appInfos/{app_info['id']}/appInfoLocalizations?limit=50", token
        ).get("data", [])
        for localization in localizations:
            attributes = localization.get("attributes", {})
            locale = attributes.get("locale", "unknown")
            if attributes.get("name") == app_name:
                print(f"{locale}: already named {app_name}")
                continue
            try:
                request_json(
                    f"/appInfoLocalizations/{localization['id']}",
                    token,
                    method="PATCH",
                    payload={
                        "data": {
                            "type": "appInfoLocalizations",
                            "id": localization["id"],
                            "attributes": {"name": app_name},
                        }
                    },
                )
            except RuntimeError as error:
                update_errors.append(f"{locale}: {error}")
                print(f"{locale}: App Store name update deferred: {error}")
                continue
            updated += 1
            print(f"{locale}: updated App Store name to {app_name}")

    if updated == 0 and update_errors:
        raise RuntimeError("; ".join(update_errors))
    if updated == 0:
        print("All App Store localizations already use the requested name.")

    copyright_text = os.environ.get("APP_COPYRIGHT", "").strip()
    if not version_string or not (arabic_description or english_description or copyright_text):
        return

    version_query = urllib.parse.urlencode(
        {"filter[platform]": "IOS", "limit": 50}
    )
    versions = request_json(
        f"/apps/{app_id}/appStoreVersions?{version_query}", token
    ).get("data", [])
    target_version = next(
        (
            version
            for version in versions
            if version.get("attributes", {}).get("versionString") == version_string
        ),
        None,
    )
    if not target_version:
        raise RuntimeError(f"App Store version {version_string} was not found")

    if copyright_text:
        request_json(f"/appStoreVersions/{target_version['id']}", token, method="PATCH", payload={"data": {
            "type": "appStoreVersions", "id": target_version["id"], "attributes": {"copyright": copyright_text}
        }})
        print("Updated copyright owner")

    localization_query = urllib.parse.urlencode(
        {"fields[appStoreVersionLocalizations]": "locale,description", "limit": 200}
    )
    version_localizations = request_json(
        f"/appStoreVersions/{target_version['id']}/appStoreVersionLocalizations?{localization_query}",
        token,
    ).get("data", [])
    if not version_localizations:
        raise RuntimeError(f"App Store version {version_string} has no localizations")

    for localization in version_localizations:
        attributes = localization.get("attributes", {})
        locale = attributes.get("locale", "unknown")
        desired = arabic_description if locale.lower().startswith("ar") else english_description
        if not desired or attributes.get("description") == desired:
            continue
        request_json(
            f"/appStoreVersionLocalizations/{localization['id']}",
            token,
            method="PATCH",
            payload={
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "id": localization["id"],
                    "attributes": {"description": desired},
                }
            },
        )
        print(f"{locale}: updated App Store description for {version_string}")


if __name__ == "__main__":
    main()
