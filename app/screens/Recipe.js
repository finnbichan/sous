import { View, Text, Pressable, SafeAreaView, ActivityIndicator, Image, Modal, Platform } from 'react-native';
import React, { useEffect, useState, useContext } from 'react';
import useStyles from '../styles/Common';
import { supabase } from '../../supabase';
import Steps from '../components/Steps';
import { AuthContext } from '../../Contexts';
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
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
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

    const DeleteModal = () => {
        if (deleteModalOpen) {
            console.log("open")
            return (
                <Modal visible={deleteModalOpen} transparent animationType='none'>
                    <Pressable
                    style={styles.overlay}
                    onPress={() => setDeleteModalOpen(false)}
                    >
                    <View style={styles.modal}>
                        <Text style={styles.text}>Are you sure you want to remove this recipe?</Text>
                        <View style={styles.modalButtons}>
                            {deleting ? <ActivityIndicator /> : (
                            <>
                                <Pressable
                                style={styles.button}
                                onPress={deleteRecipe}
                                >
                                    <Text style={styles.text}>Yes</Text>
                                </Pressable>
                                <Pressable
                                style={styles.button}
                                onPress={() => {setDeleteModalOpen(false)}}
                                >
                                    <Text style={styles.text}>Cancel</Text>
                                </Pressable>
                            </>
                            )}
                        </View>
                    </View>
                    </Pressable>
                </Modal>
            )
        }
    }

    const deleteRecipe = async () => {
        setDeleting(true);
        const data = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipe.recipe_id)
        console.log(data)
        setDeleting(false)
        navigation.navigate('Recipes', {action: "delete" + recipe.recipe_id})
    }

    return (
        <SafeAreaView style={[styles.container, {paddingTop: recipe.image_uri ? 0 : 90}]}>
            {DeleteModal()}
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
            {//TODO make collapsible
            }
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
            {/*
            TODO move delete to edit screen
            <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setDeleteModalOpen(true)}>
                <Image
                style={styles.addButton}
                source={assets.delete}
                />
            </TouchableOpacity>
            */}
        </SafeAreaView>
        
    )
}

export default Recipe;