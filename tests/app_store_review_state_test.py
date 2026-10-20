import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from app_store_review_state import verified_review_submission, wait_for_review_cancellation
from app_store_http import AppStoreHttpError


class SubmissionVerificationTests(unittest.TestCase):
    def setUp(self):
        self.versions = [{"attributes": {"versionString": "1.0.20", "appStoreState": "WAITING_FOR_REVIEW",
                                         "releaseType": "AFTER_APPROVAL"},
                          "relationships": {"build": {"data": {"id": "selected"}}}}]
        self.builds = {"selected": {"version": "85", "processingState": "VALID"}}

    def test_verifies_selected_build_review_and_automatic_release(self):
        result = verified_review_submission(self.versions, self.builds, "1.0.20", "85")
        self.assertTrue(result["verified"])
        self.assertEqual(result["build"], "85")
        self.assertEqual(result["releaseType"], "AFTER_APPROVAL")

    def test_rejects_missing_version_and_wrong_build(self):
        for version, build in [("1.0.19", "85"), ("1.0.20", "77")]:
            with self.assertRaises(RuntimeError):
                verified_review_submission(self.versions, self.builds, version, build)

    def test_rejects_unprocessed_build(self):
        self.builds["selected"]["processingState"] = "PROCESSING"
        with self.assertRaises(RuntimeError):
            verified_review_submission(self.versions, self.builds, "1.0.20", "85")

    def test_rejects_draft_without_review_submission(self):
        self.versions[0]["attributes"]["appStoreState"] = "PREPARE_FOR_SUBMISSION"
        with self.assertRaises(RuntimeError):
            verified_review_submission(self.versions, self.builds, "1.0.20", "85")

    def test_rejects_manual_release(self):
        self.versions[0]["attributes"]["releaseType"] = "MANUAL"
        with self.assertRaises(RuntimeError):
            verified_review_submission(self.versions, self.builds, "1.0.20", "85")


class ReviewCancellationTests(unittest.TestCase):
    def test_waits_for_all_canceled_submissions_not_only_unlocked_version(self):
        calls = []
        waits = []
        states = {"/reviewSubmissions/a": ["CANCELING", "COMPLETE"],
                  "/reviewSubmissions/b": ["COMPLETE"]}

        def request(path):
            calls.append(path)
            return {"data": {"attributes": {"state": states[path].pop(0)}}}

        wait_for_review_cancellation(["a", "b"], request, waits.append)
        self.assertEqual(calls.count("/reviewSubmissions/a"), 2)
        self.assertEqual(calls.count("/reviewSubmissions/b"), 1)
        self.assertEqual(waits, [5])

    def test_timeout_prevents_submitting_a_duplicate_review_item(self):
        waits = []
        with self.assertRaisesRegex(RuntimeError, "still canceling"):
            wait_for_review_cancellation(
                ["a"], lambda _: {"data": {"attributes": {"state": "CANCELING"}}},
                waits.append, attempts=2,
            )
        self.assertEqual(waits, [5])

    def test_no_cancellation_does_not_call_apple(self):
        def unexpected(_):
            self.fail("No cancellation requires no API call")
        wait_for_review_cancellation([], unexpected, unexpected)

    def test_removed_canceled_review_is_complete(self):
        calls = []
        def removed(path):
            calls.append(path)
            raise AppStoreHttpError(404, 'NOT_FOUND')
        wait_for_review_cancellation(['canceled'], removed, lambda _: self.fail('No wait required'))
        self.assertEqual(calls, ['/reviewSubmissions/canceled'])

    def test_other_apple_failures_do_not_confirm_cancellation(self):
        for status in [401, 403, 429, 500]:
            def failed(_):
                raise AppStoreHttpError(status, 'unavailable')
            with self.assertRaises(AppStoreHttpError):
                wait_for_review_cancellation(['canceled'], failed, lambda _: None)


if __name__ == "__main__":
    unittest.main()
