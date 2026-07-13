window.navigationItems = [
    {
        id: "account",
        title: "Account",
        icon: "👤",
        description: "Account recovery, bans, access, and account-related workflows.",
        parent: null,
        appearsIn: ["Account"],
        sortOrder: 1
    },
    {
        id: "age-appeals",
        title: "Age Appeals",
        icon: "🎂",
        description: "Age verification, appeals, repeated age bans, and related guidance.",
        parent: null,
        appearsIn: ["Age Appeals", "Account"],
        sortOrder: 2
    },
    {
        id: "audio",
        title: "Audio",
        icon: "🎵",
        description: "Audio recovery, takedowns, geoblocking, and audio operations.",
        parent: null,
        appearsIn: ["Audio"],
        sortOrder: 3
    },
    {
        id: "video",
        title: "Video",
        icon: "🎥",
        description: "Video reviews, Greenlight, Stories, models, and related guidance.",
        parent: null,
        appearsIn: ["Video"],
        sortOrder: 4
    },
    {
        id: "comment",
        title: "Comment",
        icon: "💬",
        description: "Comment recovery, AGS, moderation, and related workflows.",
        parent: null,
        appearsIn: ["Comment"],
        sortOrder: 5
    },
    {
        id: "dm",
        title: "DM",
        icon: "📨",
        description: "Direct Message reviews, responses, and escalation guidance.",
        parent: null,
        appearsIn: ["DM"],
        sortOrder: 6
    },
    {
        id: "gbs-ecommerce",
        title: "GBS / E-Commerce",
        icon: "🛒",
        description: "GBS operations, e-commerce guidance, allowlists, and labeling.",
        parent: null,
        appearsIn: ["GBS / E-Commerce"],
        sortOrder: 7
    },
    {
        id: "ags",
        title: "AGS",
        icon: "📋",
        description: "Agent Guidance System resources across multiple workflows.",
        parent: null,
        appearsIn: ["AGS"],
        sortOrder: 8
    },
    {
        id: "ert-legal",
        title: "ERT & Legal",
        icon: "⚖️",
        description: "Emergency Response Team requests and Legal operations.",
        parent: null,
        appearsIn: ["ERT & Legal"],
        sortOrder: 9
    },
    {
        id: "ecc-workflow",
        title: "ECC Workflow",
        icon: "📝",
        description: "ECC guidance, remarks, and multi-request workflows.",
        parent: null,
        appearsIn: ["ECC Workflow"],
        sortOrder: 10
    },
    {
        id: "live",
        title: "Live",
        icon: "📺",
        description: "LIVE moderation, AGS, age guidance, and related processes.",
        parent: null,
        appearsIn: ["Live"],
        sortOrder: 11
    },
    {
        id: "abnormal-account-issues",
        title: "Abnormal Account Issues",
        icon: "⚠️",
        description: "Special account cases, CRP, carved-out creators, and exceptions.",
        parent: null,
        appearsIn: ["Abnormal Account Issues"],
        sortOrder: 12
    },

    {
        id: "core-account",
        title: "Core Account",
        icon: "👤",
        description: "Core account review guidance and workflows.",
        parent: "account",
        appearsIn: ["Account", "Abnormal Account Issues"],
        sortOrder: 1
    },
    {
        id: "ato",
        title: "ATO",
        icon: "🔐",
        description: "Confirmed account takeover and escalation workflows.",
        parent: "account",
        appearsIn: ["Account"],
        sortOrder: 2
    },
    {
        id: "da-bans",
        title: "DA Bans",
        icon: "🛡️",
        description: "Decision Assurance ban review guidance.",
        parent: "account",
        appearsIn: ["Account"],
        sortOrder: 3
    },
    {
        id: "did-bans",
        title: "DID Bans",
        icon: "🚫",
        description: "DID ban review guidance.",
        parent: "account",
        appearsIn: ["Account"],
        sortOrder: 4
    },
    {
        id: "ads",
        title: "ADS",
        icon: "📄",
        description: "ADS account review guidance.",
        parent: "account",
        appearsIn: ["Account"],
        sortOrder: 5
    },
    {
        id: "circumvention-recidivism",
        title: "Circumvention / Recidivism",
        icon: "🔁",
        description: "Circumvention and recidivism review guidance.",
        parent: "account",
        appearsIn: ["Account", "ECC Workflow"],
        sortOrder: 6
    },
    {
        id: "impersonation-aigc",
        title: "Impersonation / AIGC Requests",
        icon: "🎭",
        description: "Impersonation and AIGC request guidance.",
        parent: "account",
        appearsIn: ["Account", "Video", "Live", "Abnormal Account Issues"],
        sortOrder: 7
    },
    {
        id: "outdated-permanent-bans",
        title: "Outdated Permanent Bans",
        icon: "⏳",
        description: "Guidance for outdated permanent ban cases.",
        parent: "account",
        appearsIn: ["Account", "Age Appeals", "DM", "AGS", "Comment", "Live"],
        sortOrder: 8
    },
    {
        id: "nml",
        title: "NML",
        icon: "📌",
        description: "NML guidance across applicable workflows.",
        parent: "account",
        appearsIn: ["Account", "Audio", "Video", "DM", "ECC Workflow", "Comment", "Live"],
        sortOrder: 9
    },

{
    id: "confirmed-ato",
    title: "Confirmed ATO",
    icon: "✅",
    description: "Guidance for confirmed account takeover cases.",
    parent: "ato",
    appearsIn: ["Account"],
    sortOrder: 1,
    recordType: "Guidance",
    status: "Active",
    workflow: "BOT",
    resourceCount: 3,
    lastUpdated: "July 2026",
    content: `
        <h3>Confirmed ATO Guidance</h3>
        <p>This is temporary placeholder content.</p>
    `
},
    {
        id: "ato-escalations",
        title: "ATO Escalations",
        icon: "⬆️",
        description: "Escalation guidance for account takeover cases.",
        parent: "ato",
        appearsIn: ["Account"],
        sortOrder: 2
    }
];