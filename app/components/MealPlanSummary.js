import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useStyles from '../styles/Common';

// breakfast/lunch/dinner: display text (recipe name or note), or null
const MealPlanSummary = ({ breakfast, lunch, dinner }) => {
    const styles = useStyles();
    const breakfaststring = breakfast || "No breakfast"
    const lunchstring = lunch || "no lunch"
    const dinnerstring = dinner || "no dinner"
    return (
        <Text style={styles.lowImpactText}>{breakfaststring}, {lunchstring}, {dinnerstring}</Text>
    );
};



export default MealPlanSummary;