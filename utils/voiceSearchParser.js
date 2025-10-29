const parseVoiceQuery = (voiceText) => {
  const query = {};
  const lowerText = voiceText.toLowerCase();

  // Extract price intent
  const priceKeywords = {
    cheap: 5000,
    affordable: 10000,
    budget: 8000,
    expensive: 50000,
    premium: 100000,
    free: 0,
  };

  for (const [keyword, maxPrice] of Object.entries(priceKeywords)) {
    if (lowerText.includes(keyword)) {
      if (keyword === "free") {
        query.maxPrice = 0;
      } else if (keyword === "expensive" || keyword === "premium") {
        query.minPrice = maxPrice;
      } else {
        query.maxPrice = maxPrice;
      }
      break;
    }
  }

  // Extract location/city
  const nigerianCities = [
    "lagos",
    "abuja",
    "port harcourt",
    "kano",
    "ibadan",
    "benin",
    "kaduna",
    "jos",
    "ilorin",
    "enugu",
    "abeokuta",
    "owerri",
    "calabar",
    "warri",
    "onitsha",
    "aba",
  ];

  for (const city of nigerianCities) {
    if (lowerText.includes(city)) {
      query.city = city.charAt(0).toUpperCase() + city.slice(1);
      break;
    }
  }

  // Extract category
  const categories = {
    tech: [
      "tech",
      "technology",
      "coding",
      "programming",
      "software",
      "ai",
      "blockchain",
    ],
    music: ["music", "concert", "band", "singing", "dj", "party"],
    sports: ["sports", "football", "basketball", "fitness", "gym", "running"],
    business: [
      "business",
      "conference",
      "networking",
      "startup",
      "entrepreneur",
    ],
    education: [
      "education",
      "workshop",
      "training",
      "course",
      "seminar",
      "learning",
    ],
    food: ["food", "cooking", "culinary", "dining", "restaurant"],
    art: ["art", "exhibition", "gallery", "painting", "drawing"],
    health: ["health", "wellness", "yoga", "meditation", "fitness"],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some((keyword) => lowerText.includes(keyword))) {
      query.category = category.charAt(0).toUpperCase() + category.slice(1);
      break;
    }
  }

  // Extract time/date intent
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lowerText.includes("today")) {
    query.startDate = today.toISOString();
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    query.endDate = endOfDay.toISOString();
  } else if (lowerText.includes("tomorrow")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    query.startDate = tomorrow.toISOString();
    const endOfTomorrow = new Date(tomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);
    query.endDate = endOfTomorrow.toISOString();
  } else if (lowerText.includes("this week") || lowerText.includes("week")) {
    query.startDate = today.toISOString();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    query.endDate = endOfWeek.toISOString();
  } else if (
    lowerText.includes("this weekend") ||
    lowerText.includes("weekend")
  ) {
    const dayOfWeek = today.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    const saturday = new Date(today);
    saturday.setDate(saturday.getDate() + daysUntilSaturday);
    const sunday = new Date(saturday);
    sunday.setDate(sunday.getDate() + 1);
    sunday.setHours(23, 59, 59, 999);
    query.startDate = saturday.toISOString();
    query.endDate = sunday.toISOString();
  } else if (lowerText.includes("next month") || lowerText.includes("month")) {
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    query.startDate = nextMonth.toISOString();
    const endOfNextMonth = new Date(nextMonth);
    endOfNextMonth.setMonth(endOfNextMonth.getMonth() + 1);
    endOfNextMonth.setDate(0);
    query.endDate = endOfNextMonth.toISOString();
  }

  // Extract search keywords (remove parsed words)
  let searchText = voiceText;
  const removeWords = [
    "cheap",
    "affordable",
    "free",
    "expensive",
    "premium",
    "in",
    "at",
    "near",
    "around",
    "this",
    "next",
    "today",
    "tomorrow",
    "week",
    "weekend",
    "month",
    "events",
    "event",
    "show",
    "find",
    "search",
    "looking for",
    "i want",
  ];

  removeWords.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    searchText = searchText.replace(regex, "");
  });

  // Remove city name from search text
  if (query.city) {
    const cityRegex = new RegExp(`\\b${query.city}\\b`, "gi");
    searchText = searchText.replace(cityRegex, "");
  }

  // Clean up search text
  searchText = searchText.trim().replace(/\s+/g, " ");

  if (searchText.length > 2) {
    query.search = searchText;
  }

  return query;
};

module.exports = { parseVoiceQuery };
