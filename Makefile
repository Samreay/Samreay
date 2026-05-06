install_node:
	@echo "Installing npm dependencies"
	@npm install

install_uv:
	@echo "Running local uv install"
	@if [ -f "uv" ]; then echo "Downloading uv" && curl -LsSf https://astral.sh/uv/install.sh | sh; else echo "uv already installed"; fi
	@uv self update || true
	@uv python install
	@uv sync

install_precommit:
	@pre-commit install

precommit:
	pre-commit run --all-files

convert:
	@echo "Converting notebooks"
	uv run python builder/convert.py

prod:
	rm -rf dist && npm run build

blog:
	npm run dev

summary:
	uv run builder/summary_generator.py

cv:
	cd resume && uv run rendercv render "Hinton_CV.yaml" \
	  && cp rendercv_output/Samuel_Hinton_CV.pdf ../astro-public/static/resume/Samuel_Hinton_CV.pdf

install: install_uv install_precommit install_node precommit

# ----- implement-plan skill -----

IMPLEMENT_PLAN_DIR := .cursor/skills/implement-plan
VERIFY := uv run $(IMPLEMENT_PLAN_DIR)/scripts/verify.py

.PHONY: implement-plan-setup
implement-plan-setup:
	@echo "Installing Playwright project for visual diffs"
	cd $(IMPLEMENT_PLAN_DIR)/scripts/visual && npm install
	# chromium powers astro-desktop and hugo-desktop; webkit powers
	# astro-mobile (iPhone SE descriptor uses webkit by default).
	cd $(IMPLEMENT_PLAN_DIR)/scripts/visual && npx playwright install chromium webkit

.PHONY: verify-phase-%
verify-phase-%:
	$(VERIFY) --phase $*

.PHONY: verify-phase-keep-%
verify-phase-keep-%:
	$(VERIFY) --phase $* --keep-normalized

.PHONY: implement-plan-update-baselines
implement-plan-update-baselines:
	@if [ -z "$(PHASE)" ]; then echo "Usage: make implement-plan-update-baselines PHASE=N" >&2; exit 2; fi
	$(VERIFY) --phase $(PHASE) --update-baselines
