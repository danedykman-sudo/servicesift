export interface Review {
  rating: number;
  text: string;
  review_date: string;
  author: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export function filterReviewsByDateRange(
  reviews: Review[],
  startDate: Date,
  endDate: Date
): Review[] {
  return reviews.filter(review => {
    const reviewDate = new Date(review.review_date);
    return reviewDate >= startDate && reviewDate <= endDate;
  });
}

export function getLast30Days(): DateRange {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  return { startDate, endDate };
}

export function getPrevious30Days(): DateRange {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 30);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 60);

  return { startDate, endDate };
}

export function getRolling180Days(): DateRange {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);

  return { startDate, endDate };
}

export function getNewSinceDate(lastAnalysisDate: Date): DateRange {
  const startDate = new Date(lastAnalysisDate);
  const endDate = new Date();

  return { startDate, endDate };
}

export function getConfidenceLabel(reviewCount: number): {
  label: string;
  color: string;
  icon: string;
} {
  if (reviewCount === 0) {
    return {
      label: 'No new data',
      color: 'gray',
      icon: '⚪'
    };
  } else if (reviewCount < 8) {
    return {
      label: 'Low confidence - early signals only',
      color: 'red',
      icon: '🔴'
    };
  } else if (reviewCount < 15) {
    return {
      label: 'Medium confidence',
      color: 'yellow',
      icon: '🟡'
    };
  } else if (reviewCount < 30) {
    return {
      label: 'Good confidence',
      color: 'green',
      icon: '🟢'
    };
  } else {
    return {
      label: 'High confidence',
      color: 'green',
      icon: '🟢'
    };
  }
}

export function formatDateRange(startDate: Date, endDate: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  };

  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
}
