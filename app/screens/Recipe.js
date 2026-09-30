import { View, Text, SafeAreaView, ActivityIndicator, Image, ScrollView, TouchableOpacity, Alert } from 'react-native';
import React, { useEffect, useState, useContext } from 'react';
import useStyles from '../styles/Common';
import { supabase } from '../../supabase';
import Steps from '../components/Steps';
import { AuthContext, CacheContext } from '../../Contexts';
import { useTheme } from '@react-navigation/native';
import AppHeaderText from '../components/AppHeaderText';
import EditButton from '../components/EditButton';
import CollapsibleSection from '../components/CollapsibleSection';
import AppText from '../components/AppText';
import BackButton from '../components/BackButton';
import { mealTypeName, toTextList, labelFor } from '../utils/recipes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
    const insets = useSafeAreaInsets();
    const hasImage = Boolean(recipe.image_uri);
    const subtitleStyle = { color: colours.text, fontSize: 18, fontWeight: '600', marginLeft: 12, marginTop: 16, marginBottom: 4 };
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
    // from your library. (Your own recipes are deleted from the edit page.)
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

    // Back/edit buttons float over the photo; without one they sit in a normal
    // row, below the status bar.
    const topButtons = (
        <View style={[
            {flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', paddingHorizontal: 16},
            hasImage
                ? {position: 'absolute', top: insets.top + 8, zIndex: 1}
                : {paddingTop: insets.top + 8, paddingBottom: 4}
        ]}>
            <View style={{borderRadius: 100, backgroundColor: colours.card, padding: 4}}>
                <BackButton nav={navigation} route={route}/>
            </View>
            {isOwnRecipe ? (
            <View style={{borderRadius: 100, backgroundColor: colours.card, padding: 4}}>
                <EditButton nav={navigation} target={"Add a recipe"} params={{prevScreen: "Recipe", recipe: recipe}}/>
            </View>
            ) : null}
        </View>
    );

    return (
        // The shared container adds a fixed Android top padding; this screen
        // handles the status bar itself (photo runs to the top edge).
        <SafeAreaView style={[styles.container, {paddingTop: 0}]}>
            {topButtons}
            <ScrollView style={{width: '100%'}} contentContainerStyle={{paddingBottom: 40}}>
            {hasImage ? (
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
            <Text style={subtitleStyle}>Description</Text>
            {recipe.description ? (
                <Text style={{color: colours.text, fontSize: 16, lineHeight: 22, marginHorizontal: 12}}>{recipe.description}</Text>
            ) : (
                <Text style={[styles.lowImpactText, {marginHorizontal: 12}]}>No description added</Text>
            )}
            {mealNames.length ? (
                <>
                    <Text style={subtitleStyle}>Suitable for</Text>
                    <View style={{flexDirection: 'row', marginLeft: 4}}>
                    {mealNames.map((name)=> (
                        <View
                        style={[styles.multiItemContainer, {backgroundColor: '#00AEFF', alignSelf: 'flex-start', marginHorizontal: 4}]}
                        key={name}
                        >
                            <Text style={styles.text}>{name}</Text>
                        </View>
                    ))}
                    </View>
                </>
            ) : null}
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
            {!isOwnRecipe && isLiked ? (
                <View style={{alignItems: 'center', marginTop: 24}}>
                    {removing ? <ActivityIndicator /> : (
                        <TouchableOpacity
                        onPress={confirmRemoveLike}
                        accessibilityRole="button"
                        style={{padding: 12}}
                        >
                            <Text style={{color: '#EF4444', fontSize: 16}}>Remove from my recipes</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : null}
            </ScrollView>
        </SafeAreaView>
    )
}

export default Recipe;