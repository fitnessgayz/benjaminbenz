document.getElementById("year").textContent = new Date().getFullYear();

const reviews = [
  { quote: "One of the best personal trainers I’ve ever worked with. He helped me figure out my goals, meet them, and train safely with better form.", name: "Jimmy L. · Yelp" },
  { quote: "No one has made me feel as motivated or given me better results. I noticed improved muscle definition, heavier lifts, and better mobility.", name: "Michael B. · Yelp" },
  { quote: "Benjamin is caring, thoughtful, and honest. His routines change based on what my body needs, and I feel stronger thanks to him.", name: "Michael S. · Yelp" },
  { quote: "Benjamin is knowledgeable, motivating, and makes every session feel focused. I always leave feeling stronger and more confident.", name: "Yelp Review" },
  { quote: "He pays attention to form, explains everything clearly, and creates workouts that actually match your goals.", name: "Yelp Review" }
];

const reviewCards = document.querySelectorAll(".review-card");
const shuffledReviews = [...reviews].sort(() => 0.5 - Math.random()).slice(0, 3);

reviewCards.forEach((card, index) => {
  const review = shuffledReviews[index];
  card.querySelector("p").textContent = `“${review.quote}”`;
  card.querySelector("strong").textContent = review.name;
});
