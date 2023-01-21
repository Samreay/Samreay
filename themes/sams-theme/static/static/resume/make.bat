xelatex HintonCV && biber HintonCV && xelatex HintonCV
xelatex HintonResume && biber HintonResume && xelatex HintonResume
xelatex HintonPublications && biber HintonPublications && xelatex HintonPublications
xelatex -interaction nonstopmode -halt-on-error HintonOnePage || xelatex -interaction nonstopmode -halt-on-error HintonOnePage
xelatex -interaction nonstopmode -halt-on-error HintonTwoPage || xelatex -interaction nonstopmode -halt-on-error HintonTwoPage
