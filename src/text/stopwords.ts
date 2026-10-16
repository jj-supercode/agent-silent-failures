const stopwordList = `
a about after all also an and any are as at be been before both but by can could did do does during each either
for from had has have he her his how i if in into is it its me more most my neither no nor not of on or our over
she so some such than that the their them then there these they this those to under was we were what when where
which while who whom whose why will with would you your`;

/** Function words that carry no topic: dropped from terms and from salient tokens ("The" in "The Beatles"). */
export const stopwords: ReadonlySet<string> = new Set(stopwordList.split(/\s+/).filter((word) => word.length > 0));
