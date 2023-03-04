install_tailwind:
	@echo "Installing theme dependencies"
	@cd npm install

install_casks:
	@echo "Installing Hugo and npm"
	@choco install -y hugo-extended nodejs-lts 

install_poetry:
	@echo "Updating poetry"
	@pip install -U poetry -q
	@echo "Running local poetry install"
	@poetry install --no-root

install_precommit:
	@pre-commit install

precommit:
	pre-commit run --all-files

convert:
	@echo "Converting notebooks"
	poetry run python builder/convert.py

blog:
	hugo server -D --verbose

summary:
	poetry run builder/summary_generator.py

install: install_casks install_poetry install_precommit install_tailwind tailwind precommit

build: tailwind convert

all: precommit tailwind