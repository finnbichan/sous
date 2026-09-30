import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useStyles from '../styles/Common';
import { useTheme } from '@react-navigation/native';
import { labelFor } from '../utils/recipes';



const RecipeBase = ({recipe}) => {
    const styles = useStyles();
    const { colours } = useTheme();
    const recipeStyles = StyleSheet.create({
        name: {
            color: colours.text,
            fontSize: 18
        },
        nameSection: {
            flexDirection: 'column',
            maxWidth: '80%'
        },
        buttonSection: {
            flexDirection: 'row',
            marginLeft: 'auto',
            alignItems: 'center',
            justifyContent: 'flex-end'
        },
        chevron: {
            maxHeight: 30,
            maxWidth: 30
        }
    })
    return (
        <View style={recipeStyles.nameSection}>
                <Text 
                    style={recipeStyles.name}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                    {recipe.name}
                </Text>
                <View style={styles.descriptorsParent}>
                    <View style={styles.descriptors}>
                        <Text style={styles.descriptorText}>{labelFor(easeList, recipe.ease)}</Text>
                    </View>
                    <View style={styles.descriptors}>
                        <Text style={styles.descriptorText}>{labelFor(cuisineList, recipe.cuisine)}</Text>
                    </View>
                    {recipe.diet == 0 ? (<></>):(
                    <View style={styles.descriptors}>
                        <Text style={styles.descriptorText}>{labelFor(dietList, recipe.diet)}</Text>
                    </View> )
                    }
                </View>
            </View>
    );
}

export default RecipeBase;