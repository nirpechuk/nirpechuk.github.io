// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-publications",
          title: "publications",
          description: "Generative robot learning and assistive sensing.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/publications/";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "Things I&#39;ve built, from autonomous hardware to tools for people.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-cv",
          title: "cv",
          description: "Education, research, experience, and teaching.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/cv/";
          },
        },{id: "projects-ballotguide",
            title: 'BallotGuide',
            description: "See how your local ballot could change your neighborhood.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/ballotguide/";
              },},{id: "projects-canvas-submission-orchestrator",
            title: 'Canvas Submission Orchestrator',
            description: "Less assignment coordination, more time for teaching.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/canvas-orchestrator/";
              },},{id: "projects-mini-prop-shop",
            title: 'Mini Prop Shop',
            description: "Market data replay meets low-latency ML inference.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/mini-prop-shop/";
              },},{id: "projects-phagentic",
            title: 'Phagentic',
            description: "An autonomous bioreactor built from scratch.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/phagentic/";
              },},{id: "projects-sock-match",
            title: 'Sock Match',
            description: "On-device computer vision for everyday accessibility.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/sockmatch/";
              },},{id: "projects-arduino-stock-ticker",
            title: 'Arduino Stock Ticker',
            description: "Live market prices on a small physical display.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/stock-ticker/";
              },},{id: "projects-truely",
            title: 'Truely',
            description: "Fact-checking agents that work directly in your browser.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/truely/";
              },},{id: "projects-verde",
            title: 'Verde',
            description: "A live map for community-led environmental action.",
            section: "Projects",handler: () => {
                window.location.href = "/projects/verde/";
              },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%6E%70%65%63%68%75%6B@%61%6E%64%72%65%77.%63%6D%75.%65%64%75", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/nirpechuk", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/nirpechuk", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
