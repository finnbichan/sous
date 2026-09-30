// Dates are exchanged with the database as local-calendar 'YYYY-MM-DD' strings.
// Never use toISOString() for these: it converts to UTC and shifts the day
// for anyone not on UTC.

export const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// 'YYYY-MM-DD' -> Date at local midnight (new Date('YYYY-MM-DD') would be UTC midnight)
export const parseLocalDate = (dateString) => new Date(`${dateString}T00:00:00`);

export const todayLocal = () => formatLocalDate(new Date());

// ['today', 'tomorrow', ...] as 'YYYY-MM-DD'
export const nextDays = (count) => {
    const dates = [];
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    for (let i = 0; i < count; i++) {
        dates.push(formatLocalDate(date));
        date.setDate(date.getDate() + 1);
    }
    return dates;
};
