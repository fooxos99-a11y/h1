def verified_review_submission(versions, builds, version_string, build_number):
    """Require the selected binary, completed processing, review, and automatic release."""
    target = next((version for version in versions
                   if version.get("attributes", {}).get("versionString") == version_string), None)
    if not target:
        raise RuntimeError("The requested App Store version was not found.")
    attributes = target.get("attributes", {})
    link = target.get("relationships", {}).get("build", {}).get("data")
    build = builds.get(link["id"], {}) if link else {}
    if str(build.get("version")) != str(build_number) or build.get("processingState") != "VALID":
        raise RuntimeError("The requested processed build is not selected for App Review.")
    if attributes.get("appStoreState") not in {
        "WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_APPLE_RELEASE",
        "PROCESSING_FOR_APP_STORE", "READY_FOR_SALE",
    }:
        raise RuntimeError("The requested version has not entered App Review.")
    if attributes.get("releaseType") != "AFTER_APPROVAL":
        raise RuntimeError("Automatic release after Apple approval is not enabled.")
    return {"verified": True, "version": version_string, "build": str(build_number),
            "state": attributes["appStoreState"], "releaseType": attributes["releaseType"],
            "buildProcessingState": build["processingState"]}


def wait_for_review_cancellation(submission_ids, request, sleep, attempts=60):
    """Apple may unlock version metadata before releasing its review item."""
    pending = set(submission_ids)
    for attempt in range(attempts):
        for submission_id in tuple(pending):
            response = request(f"/reviewSubmissions/{submission_id}")
            if response["data"]["attributes"]["state"] == "COMPLETE":
                pending.remove(submission_id)
        if not pending:
            return
        if attempt + 1 < attempts:
            sleep(5)
    raise RuntimeError("Apple is still canceling the previous review submission; retry after cancellation completes.")
