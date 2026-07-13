"""Slug tests. The cases here are drawn from the real DVDs in dicomdata/."""

from __future__ import annotations

import pytest

from app.services.slug import UNKNOWN, is_valid_uid, short_uid, slugify, user_slug


class TestSlugify:
    def test_embedded_slash_does_not_traverse(self):
        # The real StudyDescription on the CT DVD. A slash here would create a nested dir.
        assert slugify("ABDO/PELVIS - ") == "ABDO_PELVIS"

    def test_person_name_separator(self):
        assert slugify("CARANTA^ARTHUR") == "CARANTA_ARTHUR"

    def test_trailing_padding_is_stripped(self):
        assert slugify("ABDO ") == "ABDO"

    def test_accents_are_folded_to_ascii(self):
        # Zip member names on the MRI DVD ("ano-périnéale") arrive accented.
        assert slugify("IRM ano-périnéale") == "IRM_ano-perineale"

    @pytest.mark.parametrize("evil", ["../../etc/passwd", "..", ".", "/", "....//"])
    def test_traversal_attempts_are_neutralized(self, evil):
        result = slugify(evil)
        assert "/" not in result
        assert result not in {".", ".."}
        assert not result.startswith(".")

    def test_empty_and_none_fall_back(self):
        assert slugify("") == UNKNOWN
        assert slugify(None) == UNKNOWN
        assert slugify("^^^") == UNKNOWN  # an empty PersonName is all separators

    def test_truncation(self):
        assert len(slugify("A" * 200, maxlen=64)) == 64

    def test_runs_are_collapsed(self):
        assert slugify("A///B   C") == "A_B_C"


class TestShortUid:
    def test_stable_and_short(self):
        uid = "1.2.840.113619.2.55.3.604688.1"
        assert short_uid(uid) == short_uid(uid)
        assert len(short_uid(uid)) == 8

    def test_distinguishes_uids_sharing_a_suffix(self):
        # Vendors reuse suffixes; truncating the tail would collide here.
        assert short_uid("1.2.840.1.99") != short_uid("1.2.840.2.99")


class TestIsValidUid:
    def test_accepts_real_uid(self):
        assert is_valid_uid("1.2.840.10008.1.2.1")

    @pytest.mark.parametrize("bad", ["../etc/passwd", "abc", "", None, "1.2/3", ".1.2"])
    def test_rejects_anything_that_could_reach_the_filesystem(self, bad):
        assert not is_valid_uid(bad)


class TestUserSlug:
    def test_derives_from_local_part(self):
        assert user_slug("Arthur@caranta.com") == "arthur"

    def test_dedupes(self):
        assert user_slug("arthur@x.com", taken={"arthur"}) == "arthur-2"
        assert user_slug("arthur@x.com", taken={"arthur", "arthur-2"}) == "arthur-3"
