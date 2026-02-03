// Import the rendercv function and all the refactored components
#import "@preview/rendercv:0.1.0": *

// Apply the rendercv template with custom configuration
#show: rendercv.with(
  name: "Samuel Hinton",
  footer: context { [#emph[Samuel Hinton -- #str(here().page())\/#str(counter(page).final().first())]] },
  top-note: [ #emph[Last updated in Feb 2026] ],
  locale-catalog-language: "en",
  page-size: "a4",
  page-top-margin: 0.7in,
  page-bottom-margin: 0.7in,
  page-left-margin: 0.7in,
  page-right-margin: 0.7in,
  page-show-footer: false,
  page-show-top-note: false,
  colors-body: rgb(0, 0, 0),
  colors-name: rgb(0, 0, 0),
  colors-headline: rgb(15, 118, 110),
  colors-connections: rgb(0, 0, 0),
  colors-section-titles: rgb(15, 118, 110),
  colors-links: rgb(13, 148, 136),
  colors-footer: rgb(128, 128, 128),
  colors-top-note: rgb(128, 128, 128),
  typography-line-spacing: 0.6em,
  typography-alignment: "justified",
  typography-date-and-location-column-alignment: right,
  typography-font-family-body: "EB Garamond",
  typography-font-family-name: "EB Garamond",
  typography-font-family-headline: "EB Garamond",
  typography-font-family-connections: "EB Garamond",
  typography-font-family-section-titles: "EB Garamond",
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
  sections-space-between-regular-entries: 0.6em,
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
    day: 3,
  ),
)


= Samuel Hinton

  #headline([Data Scientist | Astrophysicist | Software Engineer])

#connections(
  [#link("mailto:samuelreay@gmail.com", icon: false, if-underline: false, if-color: false)[samuelreay\@gmail.com]],
  [#link("https://cosmiccoding.com.au/", icon: false, if-underline: false, if-color: false)[cosmiccoding.com.au]],
  [#link("https://linkedin.com/in/samuelreay", icon: false, if-underline: false, if-color: false)[linkedin.com\/in\/samuelreay]],
  [#link("https://github.com/samreay", icon: false, if-underline: false, if-color: false)[github.com\/samreay]],
)


== Summary

I'm a data scientist and data engineer with a focus on energy markets, forecasting, and increasing the uptake of renewable energy sources. I have over a decade of experience in industry, and years of experience within academia. I have architected, designed, built, and deployed end-to-end machine learning pipelines, data pipelines, and mission-critical software services for both academia and industry.

== Experience

#regular-entry(
  [
    #strong[Research Fellow]  --  #emph[University of Queensland]

  ],
  [
    2025

  ],
  main-column-second-row: [
    - Ran workshops and seminars on numerous topics with a focus on upskilling PhD students with industry tooling, such as containerisation, project management, dependency management, coding practising, and orchestration tooling.

    - Worked with the Schmidt Foundation in the United States to reduce fragmentation of data repositories and collections in astronomy.

    - Provided proof-of-concept modern data reduction pipelines for adoption in upcoming space telescope surveys and reimplemented existing data reduction and science pipelines to bring them up to industry standards and modern tooling.

  ],
)

#regular-entry(
  [
    #strong[Senior Data Scientist]  --  #emph[Arenko]

  ],
  [
    2020 – 2025

  ],
  main-column-second-row: [
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
    #strong[Lead Data Analyst]  --  #emph[COVID-19 Critical Care Consortium]

  ],
  [
    2020 – 2021

  ],
  main-column-second-row: [
    - Technical lead for the COVID-19 Critical Care Consortium.

    - Created the data pipeline to automatically produce machine-learning-ready data products for use in the study.

    - Created reports for clinical staff and hosted a dashboard for use in hospital sites to provide

  ],
)

#regular-entry(
  [
    #strong[Postdoctoral Researcher]  --  #emph[University of Queensland]

  ],
  [
    2019 – 2020

  ],
  main-column-second-row: [
    - Research in the areas of supernova cosmology and large scale structure, focusing heavily upon analysis pipelines and systematics control through efficient use of simulations and mocks.

    - Implemented and integrated probabilistic classification of our photometric imagery of supernovae.

    - Implemented model fitting algorithms for pathological high-dimensional posterior surfaces.

    - Increased time-efficiency of cosmological analyses by two orders of magnitude through HPC and automation.

    - Created a generalised BAO fitting program (Barry) that has been used by numerous surveys and publications.

  ],
)

#regular-entry(
  [
    #strong[Course Instructor]  --  #emph[SuperDataScience]

  ],
  [
    2019

  ],
  main-column-second-row: [
    - Created a course on statistical analysis in Python for students. Focused on applied statistics and utilisation of modern code packages, with attention given to visual output and workflows for continuous validation of methodology.

    - Created a course on utilising pandas for data cleaning, manipulation, and analytics.

  ],
)

#regular-entry(
  [
    #strong[Research Fellow]  --  #emph[Lawrence Berkeley National Laboratory]

  ],
  [
    2016, 2017

  ],
  main-column-second-row: [
    - Used high dimensional hierarchical Bayesian models to provide better constraints on cosmology using supernova discovered by the Dark Energy Survey.

  ],
)

#regular-entry(
  [
    #strong[Research Studentship]  --  #emph[Gemini & Australian Astronomical Observatory]

  ],
  [
    2015 – 2016

  ],
  main-column-second-row: [
    - Utilised photometric data of Maffei 1 to determine globular cluster candidates and their properties for spectroscopic follow-up.

    - Utilised data reduction pipelines, automated analysis methods in Python, and applied machine learning techniques to perform object classification.

  ],
)

#regular-entry(
  [
    #strong[Software Developer]  --  #emph[GBST]

  ],
  [
    2010 – 2014

  ],
  main-column-second-row: [
    - Developed business intelligence reporting solutions to visualise complex financial data.

    - Designed and developed server and client based web application code for both frontoffice and backoffice staff.

    - Created and optimised SQL queries, databases and applications for network, processing and memory constraints.

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

    #emph[Doctorate of Philosophy] #emph[in] #emph[Astrophysics]

  ],
  [
    #emph[Brisbane, Australia]

    #emph[Mar 2015 – Nov 2019]

  ],
  main-column-second-row: [
  ],
)

== Notable Awards

#regular-entry(
  [
    #strong[Lindau Nobel Laureate Delegate]  --  #emph[Australian Academy of Science]

  ],
  [
    2019

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[Future Superstar Award]  --  #emph[University of Queensland]

  ],
  [
    2019

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[Bok Prize]  --  #emph[Astronomical Society of Australia]

  ],
  [
    2016

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[Australian Postgraduate Award]  --  #emph[Australian Government]

  ],
  [
    2016

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[Science Faculty Graduate of the Year]  --  #emph[University of Queensland]

  ],
  [
    2016

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[Australian Institute of Physics Prize]  --  #emph[University of Queensland]

  ],
  [
    2016

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[University Medal (Science)]  --  #emph[University of Queensland]

  ],
  [
    2016

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[Australian Gemini Undergraduate Summer Studentships]  --  #emph[AAO]

  ],
  [
    2015

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[AAO Honours Scholarship]  --  #emph[Australian Astronomical Observatory]

  ],
  [
    2015

  ],
  main-column-second-row: [
  ],
)

#regular-entry(
  [
    #strong[University Medal (Engineering)]  --  #emph[University of Queensland]

  ],
  [
    2015

  ],
  main-column-second-row: [
  ],
)

== Communication

#regular-entry(
  [
    #strong[Industry Guest]  --  #emph[Energy Systems Catapult]

  ],
  [
    2022

  ],
  main-column-second-row: [
    #summary[Presented on the intersection between academia and industry and the current challenges facing both parties, and explored solutions to increase collaboration.]

  ],
)

#regular-entry(
  [
    #strong[Industry Guest]  --  #emph[CodeHers]

  ],
  [
    2021

  ],
  main-column-second-row: [
    #summary[Gave workshops and presentations to highschool students on coding, machine learning, and careers in STEM.]

  ],
)

#regular-entry(
  [
    #strong[Interviewed Data Scientist]  --  #emph[SuperDataScience Podcast]

  ],
  [
    2021

  ],
  main-column-second-row: [
    #summary[Participated in multiple SDS podcast episodes about topics in data science, from hypothesis testing to MLOps.]

  ],
)

#regular-entry(
  [
    #strong[Scientific Correspondent]  --  #emph[CNET, CBS]

  ],
  [
    2020

  ],
  main-column-second-row: [
    #summary[Acted as a scientific correspondent for multiple organisations to break down complicated scientific research into everyday terms.]

  ],
)

#regular-entry(
  [
    #strong[Coding\@Home Industry Partner]  --  #emph[Queensland Education, Coding\@Home]

  ],
  [
    2020

  ],
  main-column-second-row: [
    #summary[Shared the modern and future role of coding and machine learning from the perspective of an astronomer and scientist.]

  ],
)

#regular-entry(
  [
    #strong[FameLab National Finalist]  --  #emph[British Council]

  ],
  [
    2020

  ],
  main-column-second-row: [
    #summary[National finalist in the FameLab program, with topic \"Can you hear the Big bang?\"]

  ],
)

#regular-entry(
  [
    #strong[Science Friction Guest]  --  #emph[ABC Radio National]

  ],
  [
    2020

  ],
  main-column-second-row: [
    #summary[Discussed the huge transition from astrophysics to data analytics due to the COVID-19 pandemic, and the transferable skillset that science gives you.]

  ],
)

#regular-entry(
  [
    #strong[NYSF Guest Panelist]  --  #emph[National Youth Science Forum]

  ],
  [
    2020

  ],
  main-column-second-row: [
    #summary[Shared my personal journey in science outreach, and presented on how to give effective presentations.]

  ],
)

#regular-entry(
  [
    #strong[ScopeTV Guest Scientist]  --  #emph[ScopeTV, Channel 10]

  ],
  [
    2017 – 2019

  ],
  main-column-second-row: [
    #summary[Helped script, narrate and appear in ScopeTV educational astronomy episodes.]

  ],
)

#regular-entry(
  [
    #strong[Science Says! Scientific Panelist]  --  #emph[World Science Festival]

  ],
  [
    2019

  ],
  main-column-second-row: [
    #summary[Panel scientist for Science Says, a comedy science show for Brisbane's World Science Festival.]

  ],
)

#regular-entry(
  [
    #strong[Probably Science Podcast Guest Scientist]  --  #emph[Probably Science Live Podcast and Comedy Show]

  ],
  [
    2019

  ],
  main-column-second-row: [
    #summary[Guest scientist for Probably Science, joining the previous guests of Neil deGrasse Tyson, Sean Carroll and more.]

  ],
)

#regular-entry(
  [
    #strong[2SER Radio Scientific Correspondent]  --  #emph[Radio, 2SER]

  ],
  [
    2019

  ],
  main-column-second-row: [
    #summary[Monthly scientific and astronomy updates.]

  ],
)

#regular-entry(
  [
    #strong[Podcast Host]  --  #emph[Commuting the Cosmos]

  ],
  [
    2018 – 2019

  ],
  main-column-second-row: [
    #summary[Hosted and presented on a podcast about various space related concepts.]

  ],
)

#regular-entry(
  [
    #strong[Curious Kids Writer]  --  #emph[The Conversation]

  ],
  [
    2018

  ],
  main-column-second-row: [
    #summary[Consulted and authored articles for The Conversation's Curious Kids program.]

  ],
)

#regular-entry(
  [
    #strong[BrisScience Presenter]  --  #emph[BrisScience & UQ]

  ],
  [
    2018

  ],
  main-column-second-row: [
    #summary[Invited to talk at the monthly BrisScience event on the dark side of the universe.]

  ],
)

#regular-entry(
  [
    #strong[Australian Survivor Invited Contestant, Academic Champion]  --  #emph[Endemol Shine]

  ],
  [
    2018

  ],
  main-column-second-row: [
    #summary[Cast as the academic champion for the 'Champions v. Contendors' season of Australian Survivor.]

  ],
)

#regular-entry(
  [
    #strong[School Guest Presenter]  --  #emph[Clayfield College, Gumdale State School]

  ],
  [
    2017 – 2018

  ],
  main-column-second-row: [
    #summary[Talks to primary and secondary students on astronomy, science, STEM and career pathways.]

  ],
)

#regular-entry(
  [
    #strong[Science Communicator]  --  #emph[Pint of Science, Physics in the Pub]

  ],
  [
    2017 – 2019

  ],
  main-column-second-row: [
    #summary[Gave public talks to a general audience about various topics in astronomy.]

  ],
)

#regular-entry(
  [
    #strong[Invited Presenter]  --  #emph[Research Education and Development Retreat]

  ],
  [
    2017

  ],
  main-column-second-row: [
    #summary[Invited presenter at a progressional development program for physics PhD, honours and undergraduate students.]

  ],
)

#regular-entry(
  [
    #strong[Workshop Organiser, Host and Presenter]  --  #emph[CAASTRO Code Workshop]

  ],
  [
    2017

  ],
  main-column-second-row: [
    #summary[Created and presented a code workshop focusing on open-source science run across Australia.]

  ],
)

#regular-entry(
  [
    #strong[Battle of the Brains Panel Scientist]  --  #emph[National Science Week]

  ],
  [
    2017

  ],
  main-column-second-row: [
    #summary[Invited participant in a games panel discussion for physicists during National Science Week.]

  ],
)

#regular-entry(
  [
    #strong[World Science Festival Tour Guide]  --  #emph[Queensland Museum & UQ]

  ],
  [
    2017

  ],
  main-column-second-row: [
    #summary[Scientific tour guide for the Large Hadron Collider exhibit during the World Science Festival.]

  ],
)

#regular-entry(
  [
    #strong[FameLab Australia Scientist]  --  #emph[British Council]

  ],
  [
    2017

  ],
  main-column-second-row: [
    #summary[State finalist FameLab scientist. Public communication through radio interview and stage presentation.]

  ],
)

#regular-entry(
  [
    #strong[Guest Scientist, An Evening with Dr Lisa Randall]  --  #emph[ThinkInc]

  ],
  [
    2016

  ],
  main-column-second-row: [
    #summary[Gave the opening speech for the Brisbane event, talking about the exciting future of astronomy.]

  ],
)

#regular-entry(
  [
    #strong[UQ Science Demo Troupe Member]  --  #emph[University of Queensland]

  ],
  [
    2016

  ],
  main-column-second-row: [
    #summary[Joined the UQ Science Demo troupe to create resources for the group and participate in UQ demonstrations.]

  ],
)

#regular-entry(
  [
    #strong[Uluru Astronomer in Residence]  --  #emph[CAASTRO]

  ],
  [
    2016

  ],
  main-column-second-row: [
    #summary[Accompanied Sky Tours to answer scientific questions from the public and gave public lectures on popular astronomy topics.]

  ],
)

== Publications

I am an author on over 300 published articles, with the astronomy subset available through #link("https://ui.adsabs.harvard.edu/search/q=%20author%3A%22hinton%2C%20s%22%20%20year%3A2014-2025&sort=citation_count%20desc%2C%20bibcode%20desc&p_=0")[#strong[NASA ADS]]. My medical publications via the Covid 19 Critical Care Consortium will not be indexed by NASA, but can be found on my #link("https://scholar.google.com/citations?user=5AE3D6kAAAAJ")[#strong[Google scholar profile]].

Using summary statistics from SciVal, my Field-Weighted Citation Impact is 3.63 with 52.5 average citations per publication. My current h-index sits at 72, i10-index at 224, and my highest-cited first-author paper has 340 citations.

In both astronomy and medicine, large collaborations often publish key findings with the collaboration as first author, or using an alphabetical author scheme. I am an author on eleven of these papers, with a combined citation count of \~4.3k.
