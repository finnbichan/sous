import { View, Text, SafeAreaView, ActivityIndicator, Image, Platform, ScrollView, TouchableOpacity, Alert } from 'react-native';
import React, { useEffect, useState, useContext } from 'react';
import useStyles from '../styles/Common';
import { supabase } from '../../supabase';
import Steps from '../components/Steps';
import { AuthContext, CacheContext } from '../../Contexts';
import FLTextInput from '../components/FloatingLabelInput';
import { useTheme } from '@react-navigation/native';
import AppHeaderText from '../components/AppHeaderText';
import EditButton from '../components/EditButton';
import CollapsibleSection from '../components/CollapsibleSection';
import AppText from '../components/AppText';
import BackButton from '../components/BackButton';
import { mealTypeName, toTextList, labelFor } from '../utils/recipes';

const Recipe = ({route, navigation}) => {
    const [recipe, setRecipe] = useState(route.params.recipe);
    const [isLiked, setIsLiked] = useState(false);
    const [removing, setRemoving] = useState(false);
    const { setCache } = useContext(CacheContext);
    const [creatorName, setCreatorName] = useState("");
    const session = useContext(AuthContext);
    const isOwnRecipe = recipe.user_id == session.user.id;
    const { assets, colours } = useTheme();
    const styles = useStyles();
    const ingredients = toTextList(recipe.ingredients);
    const steps = toTextList(recipe.steps);
    const mealNames = (recipe.meals || []).map(mealTypeName).filter(Boolean);

    const getCreatorName = async () => {
        const {data, error} = await supabase
        .rpc('get_public_profiles', {p_ids: [recipe.user_id]})
        if (error) {
            console.log(error)
        } else {
            setCreatorName(data[0]?.display_name ?? "")
        }
    }

    useEffect(() => {
        if(!isOwnRecipe) {
            getCreatorName()
        }
    }, [])

    // Legacy likes from the removed Explore page: these recipes can be removed
    // from your library, but not deleted.
    useEffect(() => {
        if (isOwnRecipe) return;
        supabase
            .from('likedrecipes')
            .select('recipe_id')
            .eq('recipe_id', recipe.recipe_id)
            .eq('user_id', session.user.id)
            .limit(1)
            .then(({ data }) => setIsLiked(Boolean(data?.length)));
    }, [])

    const runRemoval = async (query, failureMessage) => {
        setRemoving(true);
        const { error } = await query;
        setRemoving(false);
        if (error) {
            console.log(error);
            Alert.alert('Something went wrong', failureMessage);
            return;
        }
        setCache(Date.now());
        navigation.navigate('Recipes');
    }

    const confirmDelete = () => Alert.alert(
        `Delete ${recipe.name}?`,
        'It will also be removed from your meal plans and meal history. This can\'t be undone.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () => runRemoval(
                    supabase.from('recipes').delete().eq('id', recipe.recipe_id),
                    'Could not delete this recipe. Please try again.'
                )
            }
        ]
    );

    const confirmRemoveLike = () => Alert.alert(
        `Remove ${recipe.name} from your recipes?`,
        'It won\'t be suggested or planned any more.',
        [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: () => runRemoval(
                    supabase.from('likedrecipes').delete().eq('recipe_id', recipe.recipe_id).eq('user_id', session.user.id),
                    'Could not remove this recipe. Please try again.'
                )
            }
        ]
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', position: 'absolute', top: Platform.OS === 'ios' ? 0 : 50, zIndex: 1, paddingHorizontal: 16}}>
                <View style={{borderRadius: 100, backgroundColor: colours.card, padding: 4}}>
                    <BackButton nav={navigation} route={route}/>
                </View>
                {isOwnRecipe ? (
                <View style={{borderRadius: 100, backgroundColor: colours.card, padding: 4}}>
                    <EditButton nav={navigation} target={"Add a recipe"} params={{prevScreen: "Recipe", recipe: recipe}}/>
                </View>
                ) : null}
            </View>
            <ScrollView style={{width: '100%'}} contentContainerStyle={{paddingTop: recipe.image_uri ? 0 : 90, paddingBottom: 40}}>
            {recipe.image_uri ? (
                <Image
                source={{uri : recipe.image_uri}}
                style={{height: 300, width: '100%'}}
                loadingIndicatorSource={assets.bolt}
                />
            ):(<></>)}
            <View style={styles.recipeTitleBox}>
                <AppHeaderText>{recipe.name}</AppHeaderText>
                {isOwnRecipe ? <></> :  <Text style={[styles.lowImpactText, {marginLeft: 8}]}>by {creatorName}</Text>}
            </View>
            <View style={[styles.descriptorsParent, {marginLeft: 8}]}>
                    <View style={styles.descriptors}>
                        <Text style={styles.descriptorText}>{labelFor(easeList, recipe.ease)}</Text>
                    </View>
                    <View style={styles.descriptors}>
                        <Text style={styles.descriptorText}>{labelFor(cuisineList, recipe.cuisine)}</Text>
                    </View>
                    {recipe.diet == 0 ? (<></>):(
                    <View style={styles.descriptors}>
                        <Text style={styles.descriptorText}>{labelFor(dietList, recipe.diet)}</Text>
                    </View>
                )}
            </View>
            <View>
                {recipe.description ? (
                    <FLTextInput
                    editable={false}
                    defaultValue={recipe.description}
                    label="Description"
                    />
                ) : (
                    <Text style={[styles.lowImpactText, {margin: 8}]}>No description added</Text>
                )
                }
            </View>
            <View style={{flexDirection: 'row'}}>
            {mealNames.map((name)=> {
            return (
                <View
                style={[styles.multiItemContainer, {backgroundColor: '#00AEFF', alignSelf: 'flex-start'}]}
                key={name}
                >
                    <Text style={styles.text}>{name}</Text>
                </View>
            )
            })}
            </View>
            <View>
                {ingredients ? (
                <CollapsibleSection
                title={<AppText>Ingredients</AppText>}
                open={false}
                childrenIfOpen={
                <Steps
                editable={false}
                steps={ingredients}
                />}
                childrenIfClosed={<></>}
                />
                ) : (
                    <Text style={[styles.lowImpactText, {margin: 8}]}>No ingredients added</Text>
                )}
            </View>
            <View>
                {steps ? (
                <Steps
                editable={false}
                steps={steps}
                />
                ) : (
                    <Text style={[styles.lowImpactText, {margin: 8}]}>No steps added</Text>
                )}
            </View>
            {isOwnRecipe || isLiked ? (
                <View style={{alignItems: 'center', marginTop: 24}}>
                    {removing ? <ActivityIndicator /> : (
                        <TouchableOpacity
                        onPress={isOwnRecipe ? confirmDelete : confirmRemoveLike}
                        accessibilityRole="button"
                        style={{padding: 12}}
                        >
                            <Text style={{color: '#EF4444', fontSize: 16}}>
                                {isOwnRecipe ? 'Delete recipe' : 'Remove from my recipes'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : null}
            </ScrollView>
        </SafeAreaView>
    )
}

export default Recipe;