from aqt import mw, gui_hooks
from aqt.qt import QAction
from aqt.utils import askUser, showInfo
from .core import apply_matches


def run():
    if not askUser("Unsuspend the matched AnKing cards (tagged Wilk::Match::*) and move them into "
                   "AnKing Step Deck::SFM / ::MSK subdecks?\n\nOther cards are not touched."):
        return
    mw.checkpoint("Apply AnKing matches")
    total, changed, ndecks = apply_matches(mw.col)
    mw.reset()
    showInfo(f"Done. {total} matched cards filed into {ndecks} decks ({changed} were suspended and are now unsuspended).")


action = QAction("Apply AnKing SFM/MSK matches", mw)
action.triggered.connect(run)
mw.form.menuTools.addAction(action)
