// Import the rendercv function and all the refactored components
#import "@preview/rendercv:0.1.0": *

// Apply the rendercv template with custom configuration
#show: rendercv.with(
  name: "Samuel Hinton",
  footer: context { [#emph[Samuel Hinton -- #str(here().page())\/#str(counter(page).final().first())]] },
  top-note: [ #emph[Last updated in Feb 2026] ],
  locale-catalog-language: "en",
  page-size: "us-letter",
  page-top-margin: 0.7in,
  page-bottom-margin: 0.7in,
  page-left-margin: 0.7in,
  page-right-margin: 0.7in,
  page-show-footer: true,
  page-show-top-note: true,
  colors-body: rgb(0, 0, 0),
  colors-name: rgb(0, 0, 0),
  colors-headline: rgb(0, 0, 0),
  colors-connections: rgb(0, 0, 0),
  colors-section-titles: rgb(0, 0, 0),
  colors-links: rgb(0, 0, 0),
  colors-footer: rgb(128, 128, 128),
  colors-top-note: rgb(128, 128, 128),
  typography-line-spacing: 0.6em,
  typography-alignment: "justified",
  typography-date-and-location-column-alignment: right,
  typography-font-family-body: "New Computer Modern",
  typography-font-family-name: "New Computer Modern",
  typography-font-family-headline: "New Computer Modern",
  typography-font-family-connections: "New Computer Modern",
  typography-font-family-section-titles: "New Computer Modern",
  typography-font-size-body: 10pt,
  typography-font-size-name: 30pt,
  typography-font-size-headline: 10pt,
  typography-font-size-connections: 10pt,
  typography-font-size-section-titles: 1.4em,
  typography-small-caps-name: false,
  typography-small-caps-headline: false,
  typography-small-caps-connections: false,
  typography-small-caps-section-titles: false,
  typography-bold-name: true,
  typography-bold-headline: false,
  typography-bold-connections: false,
  typography-bold-section-titles: true,
  links-underline: true,
  links-show-external-link-icon: false,
  header-alignment: center,
  header-photo-width: 3.5cm,
  header-space-below-name: 0.7cm,
  header-space-below-headline: 0.7cm,
  header-space-below-connections: 0.7cm,
  header-connections-hyperlink: true,
  header-connections-show-icons: false,
  header-connections-display-urls-instead-of-usernames: true,
  header-connections-separator: "•",
  header-connections-space-between-connections: 0.5cm,
  section-titles-type: "with_full_line",
  section-titles-line-thickness: 0.5pt,
  section-titles-space-above: 0.5cm,
  section-titles-space-below: 0.3cm,
  sections-allow-page-break: true,
  sections-space-between-text-based-entries: 0.3em,
  sections-space-between-regular-entries: 1.2em,
  entries-date-and-location-width: 4.15cm,
  entries-side-space: 0.2cm,
  entries-space-between-columns: 0.1cm,
  entries-allow-page-break: false,
  entries-short-second-row: false,
  entries-summary-space-left: 0cm,
  entries-summary-space-above: 0cm,
  entries-highlights-bullet:  "◦" ,
  entries-highlights-nested-bullet:  "◦" ,
  entries-highlights-space-left: 0.15cm,
  entries-highlights-space-above: 0cm,
  entries-highlights-space-between-items: 0cm,
  entries-highlights-space-between-bullet-and-text: 0.5em,
  date: datetime(
    year: 2026,
    month: 2,
    day: 2,
  ),
)


= Samuel Hinton

  #headline([Data Scientist | Astrophysicist | Software Engineer])

#connections(
  [Australia],
  [#link("mailto:samuelreay@gmail.com", icon: false, if-underline: false, if-color: false)[samuelreay\@gmail.com]],
  [#link("https://cosmiccoding.com.au/", icon: false, if-underline: false, if-color: false)[cosmiccoding.com.au]],
  [#link("https://linkedin.com/in/samuelreay", icon: false, if-underline: false, if-color: false)[linkedin.com\/in\/samuelreay]],
)


== Summary

I'm a data scientist and data engineer with a focus on energy markets, forecasting, and increasing the uptake of renewable energy sources. I have over a decade of experience in industry, and years of experience within academia. I have architected, designed, built, and deployed end-to-end machine learning pipelines, data pipelines, and mission-critical software services for both academia and industry.

== Experience

#regular-entry(
  [
    #strong[Research Fellow]

  ],
  [
    #emph[2025 – 2025]

  ],
  main-column-second-row: [
    #emph[University of Queensland]

    - Ran workshops and seminars on numerous topics with a focus on upskilling PhD students with industry tooling, such as containerisation, project management, dependency management, coding practising, and orchestration tooling.

    - Worked with the Schmidt Foundation in the United States to reduce fragmentation of data repositories and collections in astronomy.

    - Provided proof-of-concept modern data reduction pipelines for adoption in upcoming space telescope surveys and reimplemented existing data reduction and science pipelines to bring them up to industry standards and modern tooling.

  ],
)

#regular-entry(
  [
    #strong[Senior Data Scientist]

  ],
  [
    #emph[2020 – 2025]

  ],
  main-column-second-row: [
    #emph[Arenko]

    - Implemented #strong[MLOps] pipelines in AWS, including feature store, model versioning (mlflow), and model serving.

    - Productionised #strong[probabilistic time-series forecasting] models for UK energy markets.

    - Implemented a company-wide datalake, including data standards, ingestion, processing, and orchestration (Prefect), sending data into RDMS systems (Postgres) and cost-effective data lakes (S3, Athena, Lambda, Glue).

    - Provisioned infrastructure using CICD controlled infrastructure as code (Terraform, Docker, AWS).

    - Implemented a wide variety of forecasting algorithms, including gaussian processes, deep learning models, temporal models like GRU and LSTM, plus simpler statistical models.

    - Created interactive #strong[visualisations] of market opportunities (`matplotlib`, `plotly`, Dash, Streamlit).

    - Mentored junior data scientists and helped grow the data science team.

    - Liaised with academic and industry partners as part of the UK government's power grid digitalisation taskforce.

    - Created optimisation algorithms for trading energy, catering to a discontinuous, stochastic surface using a combination of particle swarm, genetic algorithms, and Monte-Carlo simulations.

    - Contributed to multiple open source projects, including `mlflow`, `cloudpickle`, `pandas` and `scipy`.

    - Created and maintained my own open-source libraries, including documentation, testing, example galleries, and rigorous code quality.

  ],
)

#regular-entry(
  [
    #strong[Lead Data Analyst]

  ],
  [
    #emph[2020 – 2021]

  ],
  main-column-second-row: [
    #emph[COVID-19 Critical Care Consortium]

    - Technical lead for the COVID-19 Critical Care Consortium.

    - Created the data pipeline to automatically produce machine-learning-ready data products for use in the study.

    - Created reports for clinical staff and hosted a dashboard for use in hospital sites to provide

  ],
)

#regular-entry(
  [
    #strong[Postdoctoral Researcher]

  ],
  [
    #emph[2020 – 2020]

  ],
  main-column-second-row: [
    #emph[University of Queensland]

    - Research in the areas of supernova cosmology and large scale structure, focusing heavily upon analysis pipelines and systematics control through efficient use of simulations and mocks.

    - Implemented and integrated probabilistic classification of our photometric imagery of supernovae.

    - Implemented model fitting algorithms for pathological high-dimensional posterior surfaces.

    - Increased time-efficiency of cosmological analyses by two orders of magnitude through HPC and automation.

    - Created a generalised BAO fitting program (Barry) that has been used by numerous surveys and publications.

  ],
)

#regular-entry(
  [
    #strong[Course Instructor]

  ],
  [
    #emph[2019 – 2019]

  ],
  main-column-second-row: [
    #emph[SuperDataScience]

    - Created a course on statistical analysis in Python for students. Focused on applied statistics and utilisation of modern code packages, with attention given to visual output and workflows for continuous validation of methodology.

    - Created a course on utilising pandas for data cleaning, manipulation, and analytics.

  ],
)

#regular-entry(
  [
    #strong[Research Fellow]

  ],
  [
    #emph[2016]

  ],
  main-column-second-row: [
    #emph[Lawrence Berkeley National Laboratory]

    - Research fellowship to work on Bayesian Hierarchical Modelling and its applications to Supernova Cosmology.

    - Investigated how to use high dimensional hierarchical models to model individual supernova instead of populations to provide better constraints on cosmology using supernova discovered by the Dark Energy Survey.

  ],
)

#regular-entry(
  [
    #strong[Research Studentship]

  ],
  [
    #emph[2015 – 2016]

  ],
  main-column-second-row: [
    #emph[Gemini & Australian Astronomical Observatory]

    - Utilised photometric data of Maffei 1 to determine globular cluster candidates and their properties for spectroscopic follow-up.

    - Utilised data reduction pipelines, automated analysis methods in Python, and applied machine learning techniques to perform object classification.

  ],
)

#regular-entry(
  [
    #strong[Software Developer]

  ],
  [
    #emph[2010 – 2014]

  ],
  main-column-second-row: [
    #emph[GBST]

    - Developed business intelligence reporting solutions to visualise complex financial data.

    - Designed and developed server and client based web application code for both frontoffice and backoffice staff.

    - Created large scale SQL queries, optimised queries, databases and applications for network, processing and memory constraints.

    - Developed back-end server code and front-end web applications.

  ],
)

== Education

#education-entry(
  [
    #strong[University of Queensland]

    #emph[Bachelor] #emph[in] #emph[Software Engineering]

  ],
  [
    #emph[Brisbane, Australia]

    #emph[Mar 2010 – Nov 2014]

  ],
  main-column-second-row: [
  ],
)

#education-entry(
  [
    #strong[University of Queensland]

    #emph[Doctorate] #emph[in] #emph[Astrophysics]

  ],
  [
    #emph[Brisbane, Australia]

    #emph[Mar 2015 – Nov 2019]

  ],
  main-column-second-row: [
  ],
)
