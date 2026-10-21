"""Apply the Wilk::* tags written by the matched AnKing import:
unsuspend matched cards and file them into AnKing Step Deck::<SFM|MSK>::<Exam/Week>[::Probable]."""
ROOT = "AnKing Step Deck"
EXAMS = {
    "Exam_1": "Exam 1", "Exam_2": "Exam 2", "Exam_3": "Exam 3",
    "Week_1": "Week 1", "Week_2": "Week 2", "Week_3": "Week 3",
    "ECOS_clinical_skills": "ECOS (clinical skills)", "Other": "Other",
}


def apply_matches(col, include_probable=True):
    cids = col.find_cards("tag:Wilk::Match::*")
    by_deck, unsus = {}, []
    for cid in cids:
        card = col.get_card(cid)
        tags = card.note().tags
        get = lambda p: next((t[len(p):] for t in tags if t.startswith(p)), None)
        subj, exam, tier = get("Wilk::Match::"), get("Wilk::Exam::"), get("Wilk::Tier::")
        if not (subj and exam and tier):
            continue
        if tier == "Probable" and not include_probable:
            continue
        name = "::".join([ROOT, subj, EXAMS.get(exam, exam)] + (["Probable"] if tier == "Probable" else []))
        by_deck.setdefault(name, []).append(cid)
        unsus.append(cid)
    unsus_needed = [c for c in unsus if col.get_card(c).queue == -1]
    if unsus_needed:
        col.sched.unsuspend_cards(unsus_needed)
    for name, ids in by_deck.items():
        col.set_deck(ids, col.decks.id(name))
    return len(unsus), len(unsus_needed), len(by_deck)
