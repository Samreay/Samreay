---
layout: post
title:  "Training a Neural Network Embedding Layer with Keras"
desc: "Using python, Keras and some colours to illustrate encoding as simply as possible"
date: 2020-07-26
categories: [tutorial]
tags: [statistics]
loc: 'tutorials/encoding_colours/'
permalink: tutorials/encoding_colours 
redirect_from: "/encoding_colours"

---

This little write is designed to try and explain what **embeddings** are, and how we can train a naive version of an embedding to understand and visualise the process. We'll do this using a colour dataset, Keras and good old-fashioned matplotlib.

# Introduction

Let's start simple: *What is an embedding?*

An embedding is a way to represent some categorical feature (like a word), as a dense parameter. Specifically, this is normally a unit vector in a high dimensional hypersphere. 

A common way of encoding a categorical feature of machine learning is to one-hot-encode them. However, for a large number of categories, this creates a very spare matrix. Imagine encoding the names of babies born in 2020. You might have a million records, but with ten thousand possible names, that is a **very** big matrix filled with mostly zeros. Also, names like Mat and Matt are just as similar as Mat and Patrica when you one-hot-encode. That is, not similar at all. 

Instead, if we can create a dense vector (aka a vector filled with numbers and not mostly zeros), we can represent Mat, Matt and Patrica as some location in higher dimensional space, where the Mat and Matt vectors are similar to each other. This is what we are trying to do with embeddings. To learn the translation from a categorical feature to this vector in higher dimensional space.

Most of the time when you use embeddings, you'll use them already trained and available - you won't be training them yourself. However, to understand what they are better, we'll mock up a dataset based on colour combinations, and learn the embeddings to turn a colour name into a location in both 2D and 3D space.

So, for the rest of this write up, the goal is to:

1. Start with some colours.
2. Create a data product similar to how Word2Vec and others embeddings are trained.
3. Create a model with a 2D embedding layer and train it.
4. Visualise the embedding layer.
5. Do the same for a 3D normalised embedding just for fun.

Let's get cracking!

# The colour dataset

We'll source the colour dataset available from [Kaggle here](https://www.kaggle.com/ravikanth/colour-name-and-rgb-codes). Let's load it in and view a few samples from it.

<div class="" markdown="1">
```python
import pandas as pd
import numpy as np

df_original = pd.read_csv("encoding_colours/colours.csv")
df_original = df_original.dropna(subset=["Color Name"])
num_colours = df_original.shape[0]
print(f"We have {num_colours} colours")
df_original.sample(5)
```
</div>

    We have 646 colours
    
<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>Color Name</th>
      <th>Credits</th>
      <th>R;G;B Dec</th>
      <th>RGB Hex</th>
      <th>CSS Hex</th>
      <th>BG/FG color sample</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>398</th>
      <td>honeydew4</td>
      <td>X</td>
      <td>131;139;131</td>
      <td>838B83</td>
      <td>NaN</td>
      <td>### SAMPLE ###</td>
    </tr>
    <tr>
      <th>126</th>
      <td>CadetBlue</td>
      <td>X</td>
      <td>95;158;160</td>
      <td>5F9EA0</td>
      <td>NaN</td>
      <td>### SAMPLE ###</td>
    </tr>
    <tr>
      <th>335</th>
      <td>SpringGreen4</td>
      <td>X</td>
      <td>0;139;69</td>
      <td>008B45</td>
      <td>NaN</td>
      <td>#©2006 walsh@njit.edu#</td>
    </tr>
    <tr>
      <th>310</th>
      <td>GreenYellow</td>
      <td>X</td>
      <td>173;255;47</td>
      <td>ADFF2F</td>
      <td>NaN</td>
      <td>### SAMPLE ###</td>
    </tr>
    <tr>
      <th>426</th>
      <td>HotPink4</td>
      <td>X</td>
      <td>139;58;98</td>
      <td>8B3A62</td>
      <td>NaN</td>
      <td>### SAMPLE ###</td>
    </tr>
  </tbody>
</table>
</div>

So after dropping NaNs, we have 646 different colour names. Lets throw out columns we don't want, and split the R;G;B Dec into separate columns (and then normalise them to 1).

<div class=" expanded-code" markdown="1">
```python
df = df_original.loc[:, ["Color Name", "R;G;B Dec"]]
df[["r", "g", "b"]] = df["R;G;B Dec"].str.split(";", expand=True).astype(int) / 255
df = df.drop(columns="R;G;B Dec")
df = df.rename(columns={"Color Name": "name"})
df = df.reset_index(drop=True)
df.sample(10)
```
</div>

<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>name</th>
      <th>r</th>
      <th>g</th>
      <th>b</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>93</th>
      <td>grey82</td>
      <td>0.819608</td>
      <td>0.819608</td>
      <td>0.819608</td>
    </tr>
    <tr>
      <th>556</th>
      <td>NavajoWhite4</td>
      <td>0.545098</td>
      <td>0.474510</td>
      <td>0.368627</td>
    </tr>
    <tr>
      <th>440</th>
      <td>PaleVioletRed4</td>
      <td>0.545098</td>
      <td>0.278431</td>
      <td>0.364706</td>
    </tr>
    <tr>
      <th>401</th>
      <td>sienna4</td>
      <td>0.545098</td>
      <td>0.278431</td>
      <td>0.149020</td>
    </tr>
    <tr>
      <th>58</th>
      <td>grey47</td>
      <td>0.470588</td>
      <td>0.470588</td>
      <td>0.470588</td>
    </tr>
    <tr>
      <th>392</th>
      <td>salmon</td>
      <td>0.980392</td>
      <td>0.501961</td>
      <td>0.447059</td>
    </tr>
    <tr>
      <th>626</th>
      <td>gold2</td>
      <td>0.933333</td>
      <td>0.788235</td>
      <td>0.000000</td>
    </tr>
    <tr>
      <th>240</th>
      <td>Free Speech Blue</td>
      <td>0.254902</td>
      <td>0.337255</td>
      <td>0.772549</td>
    </tr>
    <tr>
      <th>212</th>
      <td>cyan2</td>
      <td>0.000000</td>
      <td>0.933333</td>
      <td>0.933333</td>
    </tr>
    <tr>
      <th>319</th>
      <td>SpringGreen</td>
      <td>0.000000</td>
      <td>1.000000</td>
      <td>0.498039</td>
    </tr>
  </tbody>
</table>
</div>

Now theres just one more issue - you dont pass in strings or text to a neural network. You pass in numbers. So lets one-hot encode our colours to give them a numeric representation. We *could* use the Keras preprocessing `one_hot` here... but we've got this nice dataframe which already has an index... so we'll use that, and I'll make it explicit and add it as a column.

<div class=" reduced-code" markdown="1">
```python
df["num"] = df.index
df.head(10)
```
</div>

<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>name</th>
      <th>r</th>
      <th>g</th>
      <th>b</th>
      <th>num</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>Grey</td>
      <td>0.329412</td>
      <td>0.329412</td>
      <td>0.329412</td>
      <td>0</td>
    </tr>
    <tr>
      <th>1</th>
      <td>Grey, Silver</td>
      <td>0.752941</td>
      <td>0.752941</td>
      <td>0.752941</td>
      <td>1</td>
    </tr>
    <tr>
      <th>2</th>
      <td>grey</td>
      <td>0.745098</td>
      <td>0.745098</td>
      <td>0.745098</td>
      <td>2</td>
    </tr>
    <tr>
      <th>3</th>
      <td>LightGray</td>
      <td>0.827451</td>
      <td>0.827451</td>
      <td>0.827451</td>
      <td>3</td>
    </tr>
    <tr>
      <th>4</th>
      <td>LightSlateGrey</td>
      <td>0.466667</td>
      <td>0.533333</td>
      <td>0.600000</td>
      <td>4</td>
    </tr>
    <tr>
      <th>5</th>
      <td>SlateGray</td>
      <td>0.439216</td>
      <td>0.501961</td>
      <td>0.564706</td>
      <td>5</td>
    </tr>
    <tr>
      <th>6</th>
      <td>SlateGray1</td>
      <td>0.776471</td>
      <td>0.886275</td>
      <td>1.000000</td>
      <td>6</td>
    </tr>
    <tr>
      <th>7</th>
      <td>SlateGray2</td>
      <td>0.725490</td>
      <td>0.827451</td>
      <td>0.933333</td>
      <td>7</td>
    </tr>
    <tr>
      <th>8</th>
      <td>SlateGray3</td>
      <td>0.623529</td>
      <td>0.713725</td>
      <td>0.803922</td>
      <td>8</td>
    </tr>
    <tr>
      <th>9</th>
      <td>SlateGray4</td>
      <td>0.423529</td>
      <td>0.482353</td>
      <td>0.545098</td>
      <td>9</td>
    </tr>
  </tbody>
</table>
</div>

At this point, we have a nice data product, but it doesn't look like how you might train embeddings for words.

Words don't have a well defined mathematical representation to start with, instead we simply see certain words next to each other (or close to each other) more often, and we learn from that. So lets start by generating pairs of colours to emulate pairs of sequential words in what is now a colour-palette-like example.

<div class=" expanded-code" markdown="1">
```python
n = 100000 # Num samples
colour_1 = df.sample(n=n, replace=True, random_state=0).reset_index(drop=True)
colour_2 = df.sample(n=n, replace=True, random_state=42).reset_index(drop=True)
c = colour_1.merge(colour_2, left_index=True, right_index=True)
c[["name_x", "name_y"]].sample(10)
```
</div>

<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>name_x</th>
      <th>name_y</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>9838</th>
      <td>LightSalmon1</td>
      <td>bright gold</td>
    </tr>
    <tr>
      <th>44160</th>
      <td>DarkSeaGreen2</td>
      <td>goldenrod4</td>
    </tr>
    <tr>
      <th>38804</th>
      <td>firebrick</td>
      <td>CadetBlue</td>
    </tr>
    <tr>
      <th>52395</th>
      <td>DarkKhaki</td>
      <td>grey76</td>
    </tr>
    <tr>
      <th>80675</th>
      <td>DarkOliveGreen</td>
      <td>OliveDrab2</td>
    </tr>
    <tr>
      <th>28397</th>
      <td>Dark Turquoise</td>
      <td>DarkGoldenrod</td>
    </tr>
    <tr>
      <th>35853</th>
      <td>aquamarine4</td>
      <td>orange</td>
    </tr>
    <tr>
      <th>67955</th>
      <td>LightSalmon3</td>
      <td>aquamarine3, MediumAquamarine</td>
    </tr>
    <tr>
      <th>42872</th>
      <td>grey32</td>
      <td>grey13</td>
    </tr>
    <tr>
      <th>68885</th>
      <td>Neon Pink</td>
      <td>coral1</td>
    </tr>
  </tbody>
</table>
</div>

Great! A hundred thousand colour combinations. However, this is still useless. When we train embeddings on words, we want positive **and** negative examples. 

In a textual example, the pairs that come from words being next to each other are positive examples. We can generate negative examples by scrambling the document to remove meaning, and then taking pairs (of course, there many formal methods of doing this that I'm not going to go into!).

In our case, we'll define a similarity metric ourselves, by just using the distance the two colours are from each other.

<div class=" expanded-code" markdown="1">
```python
# Calculate the distance, and drop the RGB columns.
c["diff"] = ((c.r_x - c.r_y)**2 + (c.g_x - c.g_y)**2 + (c.b_x - c.b_y)**2) / 3
c = c.drop(columns=["r_x", "r_y", "g_x", "g_y", "b_x", "b_y"])
c
```
</div>

<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>name_x</th>
      <th>num_x</th>
      <th>name_y</th>
      <th>num_y</th>
      <th>diff</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>gainsboro</td>
      <td>559</td>
      <td>grey91</td>
      <td>102</td>
      <td>0.002215</td>
    </tr>
    <tr>
      <th>1</th>
      <td>Goldenrod</td>
      <td>629</td>
      <td>OrangeRed4</td>
      <td>435</td>
      <td>0.266913</td>
    </tr>
    <tr>
      <th>2</th>
      <td>SteelBlue4</td>
      <td>192</td>
      <td>tan2</td>
      <td>270</td>
      <td>0.210832</td>
    </tr>
    <tr>
      <th>3</th>
      <td>DarkSalmon</td>
      <td>359</td>
      <td>grey95</td>
      <td>106</td>
      <td>0.117621</td>
    </tr>
    <tr>
      <th>4</th>
      <td>SlateGray4</td>
      <td>9</td>
      <td>grey60</td>
      <td>71</td>
      <td>0.015999</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>99995</th>
      <td>grey65</td>
      <td>76</td>
      <td>Very Dark Brown</td>
      <td>281</td>
      <td>0.149199</td>
    </tr>
    <tr>
      <th>99996</th>
      <td>SkyBlue2</td>
      <td>180</td>
      <td>DarkOrchid2</td>
      <td>479</td>
      <td>0.105908</td>
    </tr>
    <tr>
      <th>99997</th>
      <td>LemonChiffon2</td>
      <td>592</td>
      <td>purple1</td>
      <td>525</td>
      <td>0.231757</td>
    </tr>
    <tr>
      <th>99998</th>
      <td>cornsilk1</td>
      <td>609</td>
      <td>grey74</td>
      <td>85</td>
      <td>0.045101</td>
    </tr>
    <tr>
      <th>99999</th>
      <td>brown3</td>
      <td>253</td>
      <td>LightYellow2</td>
      <td>603</td>
      <td>0.312813</td>
    </tr>
  </tbody>
</table>
<p>100000 rows × 5 columns</p>
</div>

Now that we have a difference, lets turn that into a set of positive and negative examples. I'm just going to compare the difference to a random number, and you can see this will generate a bunch of predicted values of 1 and 0.

<div class=" expanded-code" markdown="1">
```python
np.random.seed(0)
c["predict"] = (c["diff"] < 0.2 * np.random.random(c.shape[0]) ** 2).astype(int)
print(f"{100 * c.predict.mean(): 0.1f}% positive values")
c.sample(10)
```
</div>

     22.5% positive values
    
<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table class="table-auto">  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>name_x</th>
      <th>num_x</th>
      <th>name_y</th>
      <th>num_y</th>
      <th>diff</th>
      <th>predict</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>63834</th>
      <td>LightYellow1</td>
      <td>602</td>
      <td>burlywood1</td>
      <td>257</td>
      <td>0.034330</td>
      <td>0</td>
    </tr>
    <tr>
      <th>12504</th>
      <td>Dusty Rose</td>
      <td>468</td>
      <td>VioletRed3</td>
      <td>444</td>
      <td>0.041143</td>
      <td>1</td>
    </tr>
    <tr>
      <th>48828</th>
      <td>salmon1</td>
      <td>393</td>
      <td>Free Speech Green</td>
      <td>352</td>
      <td>0.410821</td>
      <td>0</td>
    </tr>
    <tr>
      <th>32737</th>
      <td>orange3</td>
      <td>390</td>
      <td>grey89</td>
      <td>100</td>
      <td>0.311926</td>
      <td>0</td>
    </tr>
    <tr>
      <th>97626</th>
      <td>red4</td>
      <td>462</td>
      <td>grey44</td>
      <td>55</td>
      <td>0.132344</td>
      <td>1</td>
    </tr>
    <tr>
      <th>31753</th>
      <td>grey57</td>
      <td>68</td>
      <td>grey78</td>
      <td>89</td>
      <td>0.044844</td>
      <td>0</td>
    </tr>
    <tr>
      <th>81431</th>
      <td>DarkSeaGreen4</td>
      <td>296</td>
      <td>burlywood3</td>
      <td>259</td>
      <td>0.058239</td>
      <td>1</td>
    </tr>
    <tr>
      <th>32403</th>
      <td>grey15</td>
      <td>26</td>
      <td>BlueViolet</td>
      <td>117</td>
      <td>0.232572</td>
      <td>0</td>
    </tr>
    <tr>
      <th>62143</th>
      <td>DarkOliveGreen1</td>
      <td>287</td>
      <td>SlateBlue4</td>
      <td>187</td>
      <td>0.286633</td>
      <td>0</td>
    </tr>
    <tr>
      <th>99415</th>
      <td>MistyRose2</td>
      <td>428</td>
      <td>SkyBlue1</td>
      <td>179</td>
      <td>0.065016</td>
      <td>1</td>
    </tr>
  </tbody>
</table>
</div>

Its common to have more negative values than positive, both because you can generate essentially infinite negative values (just keep sticking random words together for text), so I've made sure to have around a quarter positive values here. You can generate whatever ratio you like, it won't actually change how the rest of this example runs.

Now that we have a training dataset, let's make a Keras model!

<div class=" expanded-code" markdown="1">
```python
from tensorflow.random import set_seed
from tensorflow import keras
from tensorflow.keras.layers import Embedding, Dense, Lambda, Input, Subtract
import tensorflow.keras.backend as K
from tensorflow.keras.callbacks import LambdaCallback

def sum_dist(x):
    n = K.permute_dimensions(x, pattern=(1, 0, 2))
    a, b = n[0], n[1]
    return K.sum((a - b)**2, axis=-1, keepdims=True)

def get_model(embedding_dims=2):
    model = keras.Sequential()
    model.add(Embedding(num_colours, embedding_dims, input_length=2))
    model.add(Lambda(sum_dist, output_shape=(1,), name="Dist"))
    model.add(Dense(1, activation="sigmoid"))
    print(model.summary())
    model.compile(loss='binary_crossentropy', optimizer="adam", metrics=["mse"])
    return model

def setseed(i):
    np.random.seed(i), set_seed(i)
```
</div>

Okay, lets step through this. In `get_model` we ask for a normal sequential model. The `Embedding` layer is a lookup table, which will have 646 rows (one for each colour), and will produce a 2D vector for each word. Because we generate two words at a time, we set `input_length=2` - which means the output of the embeding layer will be 2 2D vectors (aka a matrix of shape `(2,2)`). 

If you don't want to combine the inputs together like I am doing, [here](https://stackoverflow.com/questions/53356849/how-to-train-a-model-with-only-an-embedding-layer-in-keras-and-no-labels) is an example where the model has two separate inputs that are combined later.

After the embedding, we have a `Lambda` layer, which simply takes that `2x2` matrix from the embedding output, splits it into `a` and `b` (the embedding vector for each of our two colours), and then returns the sum of the squared difference. Which is the Euclidean distance squared. 

The keen-eyed among you might remember that we set a positive value for our predict column before for similar vectors... and here similar vectors will have a result close to zero! 

It doesn't matter! 

The reason we don't care, is because the `Lambda` layer is connected to a single `Dense` layer, which will also train its weight and bias. If the weight is negative and bias positive, it will act as an inverting mechanism. Neural networks really are magic!

If this still upsets you though, you can change out the `K.sum`, but a naive invert will cause division by zero. To get around it, you could use Lidstone smoothing (aka add a number to the denominator so its never zero), but I digress.

Finally, to make sure I can reproduce these plots exactly, I added the `setseed` function.

Lets now instantiate the model, and fit it. Oh, I'll also save out the embedding weights using a custom callback as we go, so that we can see their evolution over epochs. 

<div class="" markdown="1">
```python
weights = []
save = LambdaCallback(on_epoch_end=lambda batch, logs: 
                      weights.append(model.layers[0].get_weights()[0]))

X, y = c[["num_x", "num_y"]], c["predict"]

setseed(7)
model = get_model()
model.fit(X, y, epochs=500, verbose=0, batch_size=512, callbacks=[save]);
```
</div>

    Model: "sequential"
    _________________________________________________________________
    Layer (type)                 Output Shape              Param #   
    =================================================================
    embedding (Embedding)        (None, 2, 2)              1292      
    _________________________________________________________________
    Dist (Lambda)                (None, 1)                 0         
    _________________________________________________________________
    dense (Dense)                (None, 1)                 2         
    =================================================================
    Total params: 1,294
    Trainable params: 1,294
    Non-trainable params: 0
    _________________________________________________________________
    None
    
**Warning: nastly plotting code below.**

Now that we have a trained model, lets see how it performed. Below is an animation of the embeddings evolving.

<div class=" expanded-code" markdown="1">
```python
%%capture
from matplotlib.animation import FuncAnimation
from IPython.display import HTML

# Get the list of colours
cs = df[["r", "g", "b"]].to_numpy()

# Create the plots
with plt.style.context("default"):
    fig, ax = plt.subplots(figsize=(10, 5))
    fig.subplots_adjust(left=0.1, right=0.9, bottom=0.15, top=0.9)
    ax.set_xlabel("$x_0$"), ax.set_ylabel("$x_1$")
    ax.set_title("Training of 2D colour embeddings")
    scat = ax.scatter(weights[-1][:, 0], weights[-1][:, 1], color=cs, s=10);

    def init():
        ax.set_xlim(weights[-1][:,0].min(), weights[-1][:,0].max())
        ax.set_ylim(weights[-1][:,1].min(), weights[-1][:,1].max())
        return scat,
    def update(i):
        scat.set_offsets(weights[i])
        return scat,

    # Split our epochs into frames
    nw = len(weights) - 1
    nf, power = 30 * 10, 2
    frames = pd.unique((np.linspace(1, nw**(1 / power), nf)**power).astype(int))
    ani = FuncAnimation(fig, update, frames=frames, 
                        init_func=init, blit=True, interval=33.3);
```
</div>

We can then use this ugly plotting code to output PNGs and turn them into a video using ffmpeg.

<div class="" markdown="1">
```python
from IPython.display import Video
ani.save('encoding_colours/embed_2d.mp4', fps=30, 
         extra_args=['-vcodec', 'libx264', '-crf', '26'])
Video("encoding_colours/embed_2d.mp4")

# If you're running this in a Jupyter notebook, the below will do the 
# same without saving it to file
# HTML(ani.to_html5_video())
```
</div>

{% include video.html url="embed_2d.mp4" autoplay="true" class="img-poster" %}
This is beautiful. From the starting randomly initialised mess, quickly structure emerges. You can see the black to white gradient down the middle, with blue and red being split on either side. Green, being in between and limited by 2D space, gets stuck in between. 

And to give you something that isn't moving to look at better, here is the final embedding.

<div class="" markdown="1">
```python
fig, ax = plt.subplots()
scat = ax.scatter(weights[-1][:, 0], weights[-1][:, 1], color=cs, s=20)
ax.set_xlabel("$x_0$"), ax.set_ylabel("$x_1$")
ax.set_title("2D Colour Embeddings");
```
</div>

{% include image.html url="main.png" class="main" %}    
And thats it! The embeddings are trained, and we could now save them out and use them in a future model where - for some unknown reason, we need to ascribe numeric value to colour names, such that similar colours are close to each other in that vector space.

# 3D Embeddings

Just for fun, lets move to 3D space. Many embeddings are normalised such that the magnitude of each embedded vector is one, so I was tempted to do that for this example... but then we'd be back to a 2D surface (the surface of the unit sphere). So no normalisation for this, but if you wanted to know how to do it, I've redefined the model and commented out an `l2_normalize` layer, which would enforce unit vectors across arbitrary dimensions.

<div class=" expanded-code" markdown="1">
```python
def get_model2(embedding_dims=3):
    model = keras.Sequential()
    model.add(Embedding(num_colours, embedding_dims, input_length=2))
    # model.add(Lambda(lambda x: K.l2_normalize(x, axis=-1), name="Norm"))
    model.add(Lambda(sum_dist, output_shape=(1,), name="Dist"))
    model.add(Dense(1, activation="sigmoid"))
    print(model.summary())
    model.compile(loss='binary_crossentropy', optimizer="adam", metrics=["mse"])
    return model

weights_3d = []
save = LambdaCallback(on_epoch_end=lambda batch, logs: 
                      weights_3d.append(model.layers[0].get_weights()[0]))
setseed(1)
model = get_model2()
model.fit(X, y, epochs=500, verbose=0, batch_size=512, callbacks=[save]);
```
</div>

    Model: "sequential_1"
    _________________________________________________________________
    Layer (type)                 Output Shape              Param #   
    =================================================================
    embedding_1 (Embedding)      (None, 2, 3)              1938      
    _________________________________________________________________
    Dist (Lambda)                (None, 1)                 0         
    _________________________________________________________________
    dense_1 (Dense)              (None, 1)                 2         
    =================================================================
    Total params: 1,940
    Trainable params: 1,940
    Non-trainable params: 0
    _________________________________________________________________
    None
    
And because the animation code for 3D plots is even uglier than the 2D, I've hidden it away. But here is the constrained 3D trained embeddings!

{% include video.html url="embed_3d.mp4" autoplay="true" class="img-poster" %}
And with the beauty of one more dimension, we can see that the RGB colour clusters can start to be separated independently.

# Summary

Hopefully in this small write up you've seen how we can train embeddings to map categorical features to a coordinate in vector space. In our specific example, we started with a colour dataset, and generated pairs of colours with a label of either 1 for "similar" or 0 for "dissimilar". We then managed to recover the relationship between colours by training an embedding only using this information.

If you want to read more on how to use embeddings in Keras, Jason Brownlee has some great write ups:

* [What are word embeddings for text?](https://machinelearningmastery.com/what-are-word-embeddings/)
* [How to Use Word Embeddings Layers for Deep Learning with Keras](https://machinelearningmastery.com/use-word-embedding-layers-deep-learning-keras/)
* [How to Develop Word Embeddings in Python with Gensim](https://machinelearningmastery.com/develop-word-embeddings-python-gensim/)

Have fun!
{% include badge.html %}

Here's the full code for convenience:

<div class="expanded-code" markdown="1">```python
from IPython.display import HTML
from IPython.display import Video
from matplotlib.animation import FuncAnimation
from tensorflow import keras
from tensorflow.keras.callbacks import LambdaCallback
from tensorflow.keras.layers import Embedding, Dense, Lambda, Input, Subtract
from tensorflow.random import set_seed
import numpy as np
import pandas as pd
import tensorflow.keras.backend as K


df_original = pd.read_csv("encoding_colours/colours.csv")
df_original = df_original.dropna(subset=["Color Name"])
num_colours = df_original.shape[0]
print(f"We have {num_colours} colours")
df_original.sample(5)

df = df_original.loc[:, ["Color Name", "R;G;B Dec"]]
df[["r", "g", "b"]] = df["R;G;B Dec"].str.split(";", expand=True).astype(int) / 255
df = df.drop(columns="R;G;B Dec")
df = df.rename(columns={"Color Name": "name"})
df = df.reset_index(drop=True)
df.sample(10)

df["num"] = df.index
df.head(10)

n = 100000 # Num samples
colour_1 = df.sample(n=n, replace=True, random_state=0).reset_index(drop=True)
colour_2 = df.sample(n=n, replace=True, random_state=42).reset_index(drop=True)
c = colour_1.merge(colour_2, left_index=True, right_index=True)
c[["name_x", "name_y"]].sample(10)

# Calculate the distance, and drop the RGB columns.
c["diff"] = ((c.r_x - c.r_y)**2 + (c.g_x - c.g_y)**2 + (c.b_x - c.b_y)**2) / 3
c = c.drop(columns=["r_x", "r_y", "g_x", "g_y", "b_x", "b_y"])
c

np.random.seed(0)
c["predict"] = (c["diff"] < 0.2 * np.random.random(c.shape[0]) ** 2).astype(int)
print(f"{100 * c.predict.mean(): 0.1f}% positive values")
c.sample(10)


def sum_dist(x):
    n = K.permute_dimensions(x, pattern=(1, 0, 2))
    a, b = n[0], n[1]
    return K.sum((a - b)**2, axis=-1, keepdims=True)

def get_model(embedding_dims=2):
    model = keras.Sequential()
    model.add(Embedding(num_colours, embedding_dims, input_length=2))
    model.add(Lambda(sum_dist, output_shape=(1,), name="Dist"))
    model.add(Dense(1, activation="sigmoid"))
    print(model.summary())
    model.compile(loss='binary_crossentropy', optimizer="adam", metrics=["mse"])
    return model

def setseed(i):
    np.random.seed(i), set_seed(i)

weights = []
save = LambdaCallback(on_epoch_end=lambda batch, logs: 
                      weights.append(model.layers[0].get_weights()[0]))

X, y = c[["num_x", "num_y"]], c["predict"]

setseed(7)
model = get_model()
model.fit(X, y, epochs=500, verbose=0, batch_size=512, callbacks=[save]);

%%capture

# Get the list of colours
cs = df[["r", "g", "b"]].to_numpy()

# Create the plots
with plt.style.context("default"):
    fig, ax = plt.subplots(figsize=(10, 5))
    fig.subplots_adjust(left=0.1, right=0.9, bottom=0.15, top=0.9)
    ax.set_xlabel("$x_0$"), ax.set_ylabel("$x_1$")
    ax.set_title("Training of 2D colour embeddings")
    scat = ax.scatter(weights[-1][:, 0], weights[-1][:, 1], color=cs, s=10);

    def init():
        ax.set_xlim(weights[-1][:,0].min(), weights[-1][:,0].max())
        ax.set_ylim(weights[-1][:,1].min(), weights[-1][:,1].max())
        return scat,
    def update(i):
        scat.set_offsets(weights[i])
        return scat,

    # Split our epochs into frames
    nw = len(weights) - 1
    nf, power = 30 * 10, 2
    frames = pd.unique((np.linspace(1, nw**(1 / power), nf)**power).astype(int))
    ani = FuncAnimation(fig, update, frames=frames, 
                        init_func=init, blit=True, interval=33.3);

ani.save('encoding_colours/embed_2d.mp4', fps=30, 
         extra_args=['-vcodec', 'libx264', '-crf', '26'])
Video("encoding_colours/embed_2d.mp4")

# If you're running this in a Jupyter notebook, the below will do the 
# same without saving it to file
# HTML(ani.to_html5_video())

fig, ax = plt.subplots()
scat = ax.scatter(weights[-1][:, 0], weights[-1][:, 1], color=cs, s=20)
ax.set_xlabel("$x_0$"), ax.set_ylabel("$x_1$")
ax.set_title("2D Colour Embeddings");

def get_model2(embedding_dims=3):
    model = keras.Sequential()
    model.add(Embedding(num_colours, embedding_dims, input_length=2))
    # model.add(Lambda(lambda x: K.l2_normalize(x, axis=-1), name="Norm"))
    model.add(Lambda(sum_dist, output_shape=(1,), name="Dist"))
    model.add(Dense(1, activation="sigmoid"))
    print(model.summary())
    model.compile(loss='binary_crossentropy', optimizer="adam", metrics=["mse"])
    return model

weights_3d = []
save = LambdaCallback(on_epoch_end=lambda batch, logs: 
                      weights_3d.append(model.layers[0].get_weights()[0]))
setseed(1)
model = get_model2()
model.fit(X, y, epochs=500, verbose=0, batch_size=512, callbacks=[save]);

```
</div>