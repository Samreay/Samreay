\ProvidesClass{friggeri-cv}[2012/04/30 CV class]
\NeedsTeXFormat{LaTeX2e}

\DeclareOption{print}{\def\@cv@print{}}
\DeclareOption*{%
  \PassOptionsToClass{\CurrentOption}{article}%
}
\ProcessOptions\relax
\LoadClass{article}


%%%%%%%%%%
% Colors %
%%%%%%%%%%

\RequirePackage{xcolor}

\definecolor{white}{RGB}{255,255,255}

\definecolor{darkgray}{HTML}{333333}
\definecolor{gray}{HTML}{444444}
\definecolor{lightgray}{HTML}{999999}
\definecolor{lightergray}{HTML}{EEEEEE}


\definecolor{green}{HTML}{C2E15F} %C2E15F
\definecolor{orange}{HTML}{FDA333} %FDA333
\definecolor{purple}{HTML}{A33FF3} %D3A4F9
\definecolor{red}{HTML}{FB4485} %FB4485
\definecolor{blue}{HTML}{22ADF2} %6CE0F1
\definecolor{higlighted}{HTML}{000000} %6CE0F1

\ifdefined\@cv@print
  \colorlet{green}{gray}
  \colorlet{orange}{gray}
  \colorlet{purple}{gray}
  \colorlet{brown}{gray}
  \colorlet{red}{gray}
  \colorlet{blue}{gray}
  \colorlet{fillheader}{lightergray}
  \colorlet{header}{gray}
\else
  \colorlet{fillheader}{lightergray}
  \colorlet{header}{gray}
\fi
\colorlet{textcolor}{gray}
\colorlet{headercolor}{gray}

%%%%%%%%%
% Fonts %
%%%%%%%%%

\RequirePackage[quiet]{fontspec}
\RequirePackage[math-style=TeX]{unicode-math}

\newfontfamily\bodyfont[]{Open Sans}
\newfontfamily\thinfont[]{Open Sans Light}
\newfontfamily\headingfont[]{Open Sans Bold}

\defaultfontfeatures{Mapping=tex-text}
\setmathfont{latinmodern-math.otf}
\setmainfont[Mapping=tex-text, Color=textcolor]{Open Sans Light}

%\setmathfont{XITS Math}

%%%%%%%%%%
% Header %
%%%%%%%%%%

\RequirePackage{tikz}

\newcommand{\rolefont}{%
  \fontsize{14pt}{24pt}\selectfont%
  \thinfont%
  \color{white}%
}

\newcommand{\header}[4]{%
  \begin{tikzpicture}[remember picture,overlay]
    \node [rectangle, fill=fillheader, anchor=north, minimum width=\paperwidth, minimum height=3.2cm] (box) at (current page.north){};
    \node [anchor=center] (name) at (box) {%
      \fontsize{32pt}{48pt}\color{header}%
      {\thinfont #1}{\bodyfont  #2}{\thinfont\LARGE #3}
    };
    \node [anchor=north] at (name.south) {%
      \fontsize{14pt}{24pt}\color{header}%
      \thinfont #4%
    };
  \end{tikzpicture}
  \vspace{1.5cm}
}


%%%%%%%%%%%%%
% Structure %
%%%%%%%%%%%%%
\RequirePackage{parskip}

\newcounter{colorCounter}
\def\@sectioncolor#1{%
  {%
    \color{%
      \ifcase\value{colorCounter}%
        blue\or%
        red\or%
        orange\or%
        green\or%
        purple\or%
        brown\else%
        headercolor\fi%
    } #1%
  }%
  %\stepcounter{colorCounter}%
}

\renewcommand{\section}[1]{
  \par\vspace{\parskip}
  {%
    \LARGE\headingfont\color{headercolor}%
    \@sectioncolor {#1}
  }
  \par\vspace{\parskip}
}

\renewcommand{\subsection}[1]{
  \par\vspace{.5\parskip}%
  {%
  \Large\headingfont\color{headercolor} #1%
  }
  \par\vspace{.25\parskip}%
}

\pagestyle{empty}


%%%%%%%%%%%%%%%%%%%%
% List environment %
%%%%%%%%%%%%%%%%%%%%

\setlength{\tabcolsep}{0pt}
\newenvironment{entrylist}{%
  \begin{tabular*}{\textwidth}{@{\extracolsep{\fill}}ll}
}{%
  \end{tabular*}
}
\renewcommand{\bfseries}{\headingfont\color{headercolor}}
\newcommand{\entry}[4]{%
  #1&\parbox[t]{11.8cm}{%
    \textbf{#2}%
    \hfill%
    {\footnotesize\addfontfeature{Color=lightgray} #3}\\%
    #4\vspace{3mm}%
  }\\}
\newcommand{\entryInline}[4]{%
  #1&\parbox[t]{12.8cm}{%
    \textbf{#2} \ \ {\footnotesize\addfontfeature{Color=lightgray} #4}%
    \hfill%
    {\footnotesize\addfontfeature{Color=lightgray} #3}%
  } \vspace{0mm}}
\newcommand{\entryInlineSmall}[4]{%
  #1&\parbox[t]{12.8cm}{%
    \textbf{#2} %
    \hfill%
    {\footnotesize\addfontfeature{Color=lightgray} #3}%
  } \vspace{0mm}}
\newcommand{\entrysmall}[4]{%
  #1&\parbox[t]{11.8cm}{%
    \textbf{#2}%
    \hfill%
    {\footnotesize\addfontfeature{Color=lightgray} #3}%
  }\\}
%%%%%%%%%%%%%%
% Side block %
%%%%%%%%%%%%%%

\RequirePackage[absolute,overlay]{textpos}
\setlength{\TPHorizModule}{1cm}
\setlength{\TPVertModule}{1cm}
\newenvironment{aside}{%
  \let\oldsection\section
  \renewcommand{\section}[1]{
    \par\vspace{\baselineskip}{\Large\headingfont\color{headercolor} ##1}
  }
  \begin{textblock}{4.5}(1, 3.42)
  \begin{flushleft}
  \obeycr
}{%
  \restorecr
  \end{flushleft}
  \end{textblock}
  \let\section\oldsection
}


%%%%%%%%%%%%%%%%
% Other tweaks %
%%%%%%%%%%%%%%%%

\RequirePackage[left=6.1cm,top=1.5cm,right=1.5cm,bottom=1.5cm,nohead,footskip=20pt]{geometry}
\RequirePackage{hyperref}