install_tailwind:
	@echo "Installing theme dependencies"
	@npm install

install_casks:
	@echo "Installing Hugo and npm"
	@brew install hugo
	@brew install nodejs

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

prod: export HUGO_ENVIRONMENT="production"
prod: export HUGO_ENV="production"
prod:
	rm -rf public && hugo --gc --minify

blog:
	uv run python resize.py && hugo server -D --logLevel info

summary:
	uv run builder/summary_generator.py

screenshots:
	uv run python convert.py

cv:
	cd resume && uv run rendercv render "Hinton_CV.yaml"

install: install_casks install_uv install_precommit install_tailwind tailwind precommit

build: tailwind convert

all: precommit tailwind