---
layout: post
title:  "Which Big City has the best Weather?"
desc: "Python Plotting Preferred Weather"
date: 2020-07-06
categories: [tutorial]
tags: [plotting]
loc: 'tutorials/us_weather/'
permalink: tutorials/us_weather 
redirect_from: "/usweather"

---

Like many people, I might one day be moving to the United States for work. However, I would like to know where I should move too. Where is too hot? Where is it too wet? Where is my little slice of paradise??

This is what we'll be making:

{% include image.html url="2020-07-06-US_Weather_1_0.png"  %}    
So using the [NOAA Global Summary of the Day](https://data.nodc.noaa.gov/cgi-bin/iso?id=gov.noaa.ncdc:C00516) and the [top 25 most populated cities in the US](https://en.wikipedia.org/wiki/List_of_United_States_cities_by_population), we've got enough to make a plot.

But first, we have to smack this data format into something useable.

## Data preparation

I downloaded the data from 2020-2013, and extract the list of a billion csv files into a directory per year. Ouch. We're going to have to pre-process this. Let's load in the list of cities first from `cities.csv`. [You can download that file here.](/static/notebooks/us_weather/cities.csv)

<div class=" reduced-code" markdown="1">
```python
import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib as mpl
import cmasher as cmr
from pathlib import Path


root = Path("D:/data/weather/")

cities = pd.read_csv(root / "cities.csv")
cities.head()
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
      <th>lat</th>
      <th>long</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>New York</td>
      <td>40.6635</td>
      <td>-73.938700</td>
    </tr>
    <tr>
      <th>1</th>
      <td>Los Angeles</td>
      <td>34.0194</td>
      <td>-118.410800</td>
    </tr>
    <tr>
      <th>2</th>
      <td>Chicago</td>
      <td>41.8376</td>
      <td>-87.681800</td>
    </tr>
    <tr>
      <th>3</th>
      <td>Washington</td>
      <td>38.9041</td>
      <td>-77.017200</td>
    </tr>
    <tr>
      <th>4</th>
      <td>San Francisco</td>
      <td>37.7775</td>
      <td>-122.416389</td>
    </tr>
  </tbody>
</table>
</div>

Then, lets find all the csv files for the US states and load them in.

Great. Now lets open one of the weather files as an example:

<div class=" expanded-code" markdown="1">
```python
pd.read_csv(root / "2020/71076099999.csv").describe().T[["mean", "std", "min", "max"]]
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
      <th>mean</th>
      <th>std</th>
      <th>min</th>
      <th>max</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>STATION</th>
      <td>7.107610e+10</td>
      <td>0.000000e+00</td>
      <td>7.107610e+10</td>
      <td>7.107610e+10</td>
    </tr>
    <tr>
      <th>LATITUDE</th>
      <td>5.956667e+01</td>
      <td>1.282585e-13</td>
      <td>5.956667e+01</td>
      <td>5.956667e+01</td>
    </tr>
    <tr>
      <th>LONGITUDE</th>
      <td>-1.084833e+02</td>
      <td>4.275283e-14</td>
      <td>-1.084833e+02</td>
      <td>-1.084833e+02</td>
    </tr>
    <tr>
      <th>ELEVATION</th>
      <td>3.180000e+02</td>
      <td>0.000000e+00</td>
      <td>3.180000e+02</td>
      <td>3.180000e+02</td>
    </tr>
    <tr>
      <th>TEMP</th>
      <td>1.806011e+01</td>
      <td>2.669257e+01</td>
      <td>-3.280000e+01</td>
      <td>6.630000e+01</td>
    </tr>
    <tr>
      <th>TEMP_ATTRIBUTES</th>
      <td>2.366854e+01</td>
      <td>1.440817e+00</td>
      <td>1.000000e+01</td>
      <td>2.400000e+01</td>
    </tr>
    <tr>
      <th>DEWP</th>
      <td>7.848315e+00</td>
      <td>2.382630e+01</td>
      <td>-4.060000e+01</td>
      <td>4.990000e+01</td>
    </tr>
    <tr>
      <th>DEWP_ATTRIBUTES</th>
      <td>2.361236e+01</td>
      <td>1.461856e+00</td>
      <td>1.000000e+01</td>
      <td>2.400000e+01</td>
    </tr>
    <tr>
      <th>SLP</th>
      <td>1.017151e+03</td>
      <td>1.084217e+01</td>
      <td>9.926000e+02</td>
      <td>1.048300e+03</td>
    </tr>
    <tr>
      <th>SLP_ATTRIBUTES</th>
      <td>2.366854e+01</td>
      <td>1.440817e+00</td>
      <td>1.000000e+01</td>
      <td>2.400000e+01</td>
    </tr>
    <tr>
      <th>STP</th>
      <td>9.654730e+02</td>
      <td>1.031018e+02</td>
      <td>4.500000e+00</td>
      <td>9.986000e+02</td>
    </tr>
    <tr>
      <th>STP_ATTRIBUTES</th>
      <td>2.366854e+01</td>
      <td>1.440817e+00</td>
      <td>1.000000e+01</td>
      <td>2.400000e+01</td>
    </tr>
    <tr>
      <th>VISIB</th>
      <td>9.999000e+02</td>
      <td>3.192211e-12</td>
      <td>9.999000e+02</td>
      <td>9.999000e+02</td>
    </tr>
    <tr>
      <th>VISIB_ATTRIBUTES</th>
      <td>0.000000e+00</td>
      <td>0.000000e+00</td>
      <td>0.000000e+00</td>
      <td>0.000000e+00</td>
    </tr>
    <tr>
      <th>WDSP</th>
      <td>4.801685e+00</td>
      <td>2.247471e+00</td>
      <td>6.000000e-01</td>
      <td>1.490000e+01</td>
    </tr>
    <tr>
      <th>WDSP_ATTRIBUTES</th>
      <td>2.366854e+01</td>
      <td>1.440817e+00</td>
      <td>1.000000e+01</td>
      <td>2.400000e+01</td>
    </tr>
    <tr>
      <th>MXSPD</th>
      <td>8.594944e+00</td>
      <td>3.352649e+00</td>
      <td>1.900000e+00</td>
      <td>1.810000e+01</td>
    </tr>
    <tr>
      <th>GUST</th>
      <td>5.808478e+02</td>
      <td>4.868429e+02</td>
      <td>1.500000e+01</td>
      <td>9.999000e+02</td>
    </tr>
    <tr>
      <th>MAX</th>
      <td>3.051124e+01</td>
      <td>2.678324e+01</td>
      <td>-2.310000e+01</td>
      <td>8.200000e+01</td>
    </tr>
    <tr>
      <th>MIN</th>
      <td>7.076404e+00</td>
      <td>2.663468e+01</td>
      <td>-4.320000e+01</td>
      <td>5.450000e+01</td>
    </tr>
    <tr>
      <th>PRCP</th>
      <td>2.904494e-02</td>
      <td>7.611089e-02</td>
      <td>0.000000e+00</td>
      <td>5.600000e-01</td>
    </tr>
    <tr>
      <th>SNDP</th>
      <td>4.333691e+02</td>
      <td>4.848170e+02</td>
      <td>8.000000e-01</td>
      <td>9.999000e+02</td>
    </tr>
    <tr>
      <th>FRSHTT</th>
      <td>0.000000e+00</td>
      <td>0.000000e+00</td>
      <td>0.000000e+00</td>
      <td>0.000000e+00</td>
    </tr>
  </tbody>
</table>
</div>

Alright, so we have one csv file per year, per station. And what we'd want to do is match stations within a certain lat/long distance to the city coordinate. Oh boy, this is going to take a while to run. 

Let's write up something that goes through and just extracts station, lat, long, and then filters down to the stations we want. Im only going to use stations from 2020 (but they'll have data from other years).

<div class="" markdown="1">
```python
station_locations = root / "station_locations.csv"

# If Ive done this before, load in the previous results
if os.path.exists(station_locations):
    station_df = pd.read_csv(station_locations)
    
# Or else figure it out from scratch using 2020 year
else:
    stations = {}
    y = "2020"
    for f in os.listdir(root / y):
        path = root / y / f
        cols = ["STATION", "LATITUDE", "LONGITUDE"]
        res = pd.read_csv(path, nrows=1, usecols=cols)
        stations[f.replace(".csv", "")] = res
    station_df = pd.concat(list(stations.values()))
    station_df.columns = ["station", "lat", "long"]
    station_df.to_csv(station_locations, index=False)
```
</div>

Wow that took a long time to run. Lets save it out so we don't have to do that again. And then Im going to edit the code above to check that the `station_location.csv` doesn't exist, so this doesn't run whenever I start this notebook up.

<div class=" reduced-code" markdown="1">
```python
# Checking everything looks alright
station_df.head()
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
      <th>station</th>
      <th>lat</th>
      <th>long</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>1001099999</td>
      <td>70.933333</td>
      <td>-8.666667</td>
    </tr>
    <tr>
      <th>1</th>
      <td>1001499999</td>
      <td>59.791925</td>
      <td>5.340850</td>
    </tr>
    <tr>
      <th>2</th>
      <td>1002099999</td>
      <td>80.050000</td>
      <td>16.250000</td>
    </tr>
    <tr>
      <th>3</th>
      <td>1003099999</td>
      <td>77.000000</td>
      <td>15.500000</td>
    </tr>
    <tr>
      <th>4</th>
      <td>1006099999</td>
      <td>78.250000</td>
      <td>22.816667</td>
    </tr>
  </tbody>
</table>
</div>

Okay, first issue down. Now what we can do is filter that list to determine which stations are in the cities we care about. So we want a method to map a station to a city, if it is close enough

<div class="" markdown="1">
```python
def check_station(row, threshold=0.1):
    station, lat, long, *_ = row
    found = False
    distance = (cities.lat - lat)**2 + (cities.long - long)**2
    matches = distance < threshold
    if matches.sum():
        return cities[matches].name.iloc[0]
    else:
        return np.NaN
    
# Lets test this works, we should get New York out
check_station(("New York", 40.6, -73.9))
```
</div>

    'New York'

Fantastic. Now lets run it over all stations:

<div class="" markdown="1">
```python
station_df["city"] = station_df.apply(check_station, axis=1)
final_stations = station_df.set_index("station").dropna()
final_stations.head()
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
      <th>lat</th>
      <th>long</th>
      <th>city</th>
    </tr>
    <tr>
      <th>station</th>
      <th></th>
      <th></th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>71538099999</th>
      <td>42.275556</td>
      <td>-82.955556</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>72011354829</th>
      <td>42.543060</td>
      <td>-83.178060</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>72029153970</th>
      <td>32.746940</td>
      <td>-96.530560</td>
      <td>Dallas</td>
    </tr>
    <tr>
      <th>72030464752</th>
      <td>40.100000</td>
      <td>-75.266670</td>
      <td>Philadelphia</td>
    </tr>
    <tr>
      <th>72033493764</th>
      <td>39.166670</td>
      <td>-77.166670</td>
      <td>Washington</td>
    </tr>
  </tbody>
</table>
</div>

Great, so we've got matching weather stations now. In fact, we have 91 of them! Now for the super slow part. For each of these stations, I want to go through and load in the csv files for all available years, keeping the city information preserved.

<div class=" expanded-code" markdown="1">
```python
years = [y for y in os.listdir(root) if os.path.isdir(root / y)]
cols = ["STATION", "DATE", "MAX", "WDSP", "PRCP"]

df_name = root / "weather.csv"

if os.path.exists(df_name):
    df_weather = pd.read_csv(df_name)
else:
    dfs = []
    for y in years:
        for f in os.listdir(root / y):
            station = int(f.replace(".csv", ""))
            if station in final_stations.index:
                df = pd.read_csv(root / y / f, usecols=cols, parse_dates=["DATE"])
                df["city"] = final_stations.loc[station, "city"]
                dfs.append(df)
    df_weather = pd.concat(dfs).reset_index(drop=True)
    df_weather.to_csv(df_name, index=False)
    
df_weather    
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
      <th>STATION</th>
      <th>DATE</th>
      <th>WDSP</th>
      <th>MAX</th>
      <th>PRCP</th>
      <th>city</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>71538099999</td>
      <td>2013-01-01</td>
      <td>7.3</td>
      <td>34.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>1</th>
      <td>71538099999</td>
      <td>2013-01-02</td>
      <td>5.8</td>
      <td>30.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>2</th>
      <td>71538099999</td>
      <td>2013-01-03</td>
      <td>10.0</td>
      <td>28.4</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>3</th>
      <td>71538099999</td>
      <td>2013-01-04</td>
      <td>14.8</td>
      <td>30.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>4</th>
      <td>71538099999</td>
      <td>2013-01-05</td>
      <td>9.5</td>
      <td>30.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>426336</th>
      <td>99849999999</td>
      <td>2020-06-26</td>
      <td>3.3</td>
      <td>78.6</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426337</th>
      <td>99849999999</td>
      <td>2020-06-27</td>
      <td>4.8</td>
      <td>84.7</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426338</th>
      <td>99849999999</td>
      <td>2020-06-28</td>
      <td>3.1</td>
      <td>84.9</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426339</th>
      <td>99849999999</td>
      <td>2020-06-29</td>
      <td>2.9</td>
      <td>79.9</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426340</th>
      <td>99849999999</td>
      <td>2020-06-30</td>
      <td>3.1</td>
      <td>80.1</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
  </tbody>
</table>
<p>426341 rows × 6 columns</p>
</div>

Alright, now we're getting somewhere, 225k rows! Except, oh boy, I can see that 999 is being used as a NaN value. Lets fix that up.

<div class=" expanded-code" markdown="1">
```python
# Yes it has all three variants -_-
df_weather = df_weather.replace(999.9, np.NaN).replace(99.99, np.NaN).replace(9999.9, np.NaN)
df_weather
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
      <th>STATION</th>
      <th>DATE</th>
      <th>WDSP</th>
      <th>MAX</th>
      <th>PRCP</th>
      <th>city</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>71538099999</td>
      <td>2013-01-01</td>
      <td>7.3</td>
      <td>34.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>1</th>
      <td>71538099999</td>
      <td>2013-01-02</td>
      <td>5.8</td>
      <td>30.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>2</th>
      <td>71538099999</td>
      <td>2013-01-03</td>
      <td>10.0</td>
      <td>28.4</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>3</th>
      <td>71538099999</td>
      <td>2013-01-04</td>
      <td>14.8</td>
      <td>30.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>4</th>
      <td>71538099999</td>
      <td>2013-01-05</td>
      <td>9.5</td>
      <td>30.2</td>
      <td>0.0</td>
      <td>Detroit</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>426336</th>
      <td>99849999999</td>
      <td>2020-06-26</td>
      <td>3.3</td>
      <td>78.6</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426337</th>
      <td>99849999999</td>
      <td>2020-06-27</td>
      <td>4.8</td>
      <td>84.7</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426338</th>
      <td>99849999999</td>
      <td>2020-06-28</td>
      <td>3.1</td>
      <td>84.9</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426339</th>
      <td>99849999999</td>
      <td>2020-06-29</td>
      <td>2.9</td>
      <td>79.9</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
    <tr>
      <th>426340</th>
      <td>99849999999</td>
      <td>2020-06-30</td>
      <td>3.1</td>
      <td>80.1</td>
      <td>0.0</td>
      <td>Chicago</td>
    </tr>
  </tbody>
</table>
<p>426341 rows × 6 columns</p>
</div>

## Data engineering

The distinction here is that - at this point - we have a viable dataset which we can now manipulate as we see fit. We can create features and play around, but we have *right here* as a checkpoint. What I want to do is create a few **features** to determine what I would consider a good or bad day is. I'll be simple, and break this into **temperature** and **weather** features. And note that - as I don't really care what temperature it is during the night, I'll use the max temperature for everything.

I want to define two sliding scales, between -1 and 1, where -1 is a horrible cold day, and 1 is a horrible hot day. Aka hot and bad weather, or cold and bad weather. This is obviously **entirely** subjective, but what I'll do is this:

* "Cold" becomes normalised between -10C to 15C (14F to 59F)
* "Hot" becomes normalised between 28C to 38C (83F to 100F)
* Precipitation (in inches) is normalised between 0 and 1.5
* Wind (in knots) is normalised between 0 and 20
* Weather is the maximum between precipiation and wind

We can see the distributions here:

<div class=" expanded-code" markdown="1">
```python
df_weather[["MAX", "PRCP", "WDSP"]].hist(bins=100, log=True, layout=(1, 3), figsize=(10, 4));
```
</div>

{% include image.html url="2020-07-06-US_Weather_20_0.png"  %}    
So let's add in that feature:

<div class=" expanded-code" markdown="1">
```python
from sklearn.preprocessing import minmax_scale

df_weather["cold"] = minmax_scale(df_weather.MAX.clip(14, 59), (-1, 0))
df_weather["hot"] = minmax_scale(df_weather.MAX.clip(83, 100), (0, 1))
df_weather["rating_precip"] = minmax_scale(df_weather.PRCP.clip(0, 1.5), (0, 1))
df_weather["rating_wind"] = minmax_scale(df_weather.PRCP.clip(0, 20), (0, 1))

# Combine the weather and temp ratings
df_weather["rating_weather"] = df_weather[["rating_precip", "rating_wind"]].max(axis=1)
df_weather["rating_temp"] = df_weather.cold + df_weather.hot + 0.001

# Make some little feature to represent our total rating
df_weather["rating"] = np.sign(df_weather.rating_temp) * df_weather.rating_weather + df_weather.rating_temp
df_weather["rating"] = minmax_scale(df_weather["rating"].clip(-1, 1))
```
</div>

<div class="" markdown="1">
```python
ax = df_weather["rating"].hist(bins=100, log=True, figsize=(8, 4))
ax.set_xlabel("Rating"), ax.set_ylabel("Frequency");
```
</div>

{% include image.html url="2020-07-06-US_Weather_23_0.png"  %}    
Obiously **this is all completely dependent on arbitrary choices on weather**. Let's not get caught up on that. We can come back to this feature later if we need. For now, we want to take all the datapoints we have and take the average for each day in the year.

<div class="" markdown="1">
```python
df_weather["day"] = df_weather.DATE.dt.dayofyear
df = df_weather.groupby(["city", "day"]).rating.mean().reset_index()
df
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
      <th>city</th>
      <th>day</th>
      <th>rating</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>Atlanta</td>
      <td>1</td>
      <td>0.411146</td>
    </tr>
    <tr>
      <th>1</th>
      <td>Atlanta</td>
      <td>2</td>
      <td>0.349296</td>
    </tr>
    <tr>
      <th>2</th>
      <td>Atlanta</td>
      <td>3</td>
      <td>0.442816</td>
    </tr>
    <tr>
      <th>3</th>
      <td>Atlanta</td>
      <td>4</td>
      <td>0.491880</td>
    </tr>
    <tr>
      <th>4</th>
      <td>Atlanta</td>
      <td>5</td>
      <td>0.398219</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>10975</th>
      <td>Washington</td>
      <td>362</td>
      <td>0.423438</td>
    </tr>
    <tr>
      <th>10976</th>
      <td>Washington</td>
      <td>363</td>
      <td>0.404648</td>
    </tr>
    <tr>
      <th>10977</th>
      <td>Washington</td>
      <td>364</td>
      <td>0.357907</td>
    </tr>
    <tr>
      <th>10978</th>
      <td>Washington</td>
      <td>365</td>
      <td>0.335265</td>
    </tr>
    <tr>
      <th>10979</th>
      <td>Washington</td>
      <td>366</td>
      <td>0.369574</td>
    </tr>
  </tbody>
</table>
<p>10980 rows × 3 columns</p>
</div>

## Make the plot

Again we're going to run into the issue that we've compressed two axes (temp and weather) down into one. Ah well, I'm not going to publish this anyway!

First thing is I'll just sort cities based on their average rating, and pick a colorset. I'm going to use a colormap from `cmasher` because I think it look great.

<div class=" expanded-code" markdown="1">
```python
city_order = df.groupby("city").rating.mean().sort_values(ascending=False)
cmap = plt.get_cmap('cmr.fusion_r')
```
</div>

And then away we go plotting!

<div class=" expanded-code" markdown="1">
```python
# Get a nice dark figure
bg = "#111111"
plt.style.use("dark_background")
fig, axes = plt.subplots(ncols=5, nrows=6, figsize=(10, 12))
fig.patch.set_facecolor(bg)

# Make donut plots
for (city, avg), ax in zip(city_order.iteritems(), axes.flatten()):
    df_tmp = df[df.city == city]
    xs = np.ones(df_tmp.shape[0])
    colors = [cmap(0.95 * r) for r in df_tmp.rating]
    ws, ts = ax.pie(xs, colors=colors, counterclock=False, startangle=90)
    # Set the line for each wedge to stop artifacts
    for w, c in zip(ws, colors):
        w.set_linewidth(0.5)
        w.set_edgecolor(c)
        
    ax.set_title(city, pad=-2)
    ax.set_aspect('equal', 'box')
    ax.add_artist(plt.Circle((0, 0), .6, color=bg))
    
    # Add average rating color circle
    ax.add_artist(plt.Circle((0, 0), .2, color=cmap(avg)))


# Add the custom colorbar
fig.subplots_adjust(top=0.83, bottom=0.04)
cbar_ax = fig.add_axes([0.2, 0.9, 0.6, 0.015])
cbar_ax.set_title("Yearly weather trends for major US cities", pad=25, fontsize=18)
cb = mpl.colorbar.ColorbarBase(cbar_ax, cmap=cmap, orientation='horizontal', 
                               ticks=[0, 0.25, 0.5, 0.75, 1])
cb.outline.set_visible(False)
cb.ax.set_xticklabels(["Cold and/or \nBad Weather", "Chilly", "Feeling good", "Warm", "Hot and/or\nBad Weather"]);

# And add our annotations
plt.annotate('Using completely arbitrary temperature preferences', 
                    (0.5,1), (0, 15), xycoords='axes fraction', color="#a19a92",
                    textcoords='offset points', size=10, va='top', ha="center")
plt.annotate('Source: NOAA (https://data.nodc.noaa.gov/cgi-bin/iso?id=gov.noaa.ncdc:C00516)', 
                    (0.5,0.024), (0, 0), xycoords='figure fraction', color="#a19a92",
                    textcoords='offset points', size=10, va='bottom', ha="center")

```
</div>

{% include image.html url="2020-07-06-US_Weather_29_0.png" class="img-large" %}    
There we go! Its not perfect, but I think it's pretty, and certainly San Jose is looking like a real nice place to go! And lets not go live in Phoenix. I don't know if its just stupidly hot or theres bad weather as well (a failing of the plot I admit), either way - nope.

{% include badge.html %}

Here's the full code for convenience:

<div class="expanded-code" markdown="1">```python
from pathlib import Path
from sklearn.preprocessing import minmax_scale
import cmasher as cmr
import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
import os
import pandas as pd



root = Path("D:/data/weather/")

cities = pd.read_csv(root / "cities.csv")
cities.head()

pd.read_csv(root / "2020/71076099999.csv").describe().T[["mean", "std", "min", "max"]]

station_locations = root / "station_locations.csv"

# If Ive done this before, load in the previous results
if os.path.exists(station_locations):
    station_df = pd.read_csv(station_locations)
    
# Or else figure it out from scratch using 2020 year
else:
    stations = {}
    y = "2020"
    for f in os.listdir(root / y):
        path = root / y / f
        cols = ["STATION", "LATITUDE", "LONGITUDE"]
        res = pd.read_csv(path, nrows=1, usecols=cols)
        stations[f.replace(".csv", "")] = res
    station_df = pd.concat(list(stations.values()))
    station_df.columns = ["station", "lat", "long"]
    station_df.to_csv(station_locations, index=False)

# Checking everything looks alright
station_df.head()

def check_station(row, threshold=0.1):
    station, lat, long, *_ = row
    found = False
    distance = (cities.lat - lat)**2 + (cities.long - long)**2
    matches = distance < threshold
    if matches.sum():
        return cities[matches].name.iloc[0]
    else:
        return np.NaN
    
# Lets test this works, we should get New York out
check_station(("New York", 40.6, -73.9))

station_df["city"] = station_df.apply(check_station, axis=1)
final_stations = station_df.set_index("station").dropna()
final_stations.head()

years = [y for y in os.listdir(root) if os.path.isdir(root / y)]
cols = ["STATION", "DATE", "MAX", "WDSP", "PRCP"]

df_name = root / "weather.csv"

if os.path.exists(df_name):
    df_weather = pd.read_csv(df_name)
else:
    dfs = []
    for y in years:
        for f in os.listdir(root / y):
            station = int(f.replace(".csv", ""))
            if station in final_stations.index:
                df = pd.read_csv(root / y / f, usecols=cols, parse_dates=["DATE"])
                df["city"] = final_stations.loc[station, "city"]
                dfs.append(df)
    df_weather = pd.concat(dfs).reset_index(drop=True)
    df_weather.to_csv(df_name, index=False)
    
df_weather    

# Yes it has all three variants -_-
df_weather = df_weather.replace(999.9, np.NaN).replace(99.99, np.NaN).replace(9999.9, np.NaN)
df_weather

df_weather[["MAX", "PRCP", "WDSP"]].hist(bins=100, log=True, layout=(1, 3), figsize=(10, 4));


df_weather["cold"] = minmax_scale(df_weather.MAX.clip(14, 59), (-1, 0))
df_weather["hot"] = minmax_scale(df_weather.MAX.clip(83, 100), (0, 1))
df_weather["rating_precip"] = minmax_scale(df_weather.PRCP.clip(0, 1.5), (0, 1))
df_weather["rating_wind"] = minmax_scale(df_weather.PRCP.clip(0, 20), (0, 1))

# Combine the weather and temp ratings
df_weather["rating_weather"] = df_weather[["rating_precip", "rating_wind"]].max(axis=1)
df_weather["rating_temp"] = df_weather.cold + df_weather.hot + 0.001

# Make some little feature to represent our total rating
df_weather["rating"] = np.sign(df_weather.rating_temp) * df_weather.rating_weather + df_weather.rating_temp
df_weather["rating"] = minmax_scale(df_weather["rating"].clip(-1, 1))

ax = df_weather["rating"].hist(bins=100, log=True, figsize=(8, 4))
ax.set_xlabel("Rating"), ax.set_ylabel("Frequency");

df_weather["day"] = df_weather.DATE.dt.dayofyear
df = df_weather.groupby(["city", "day"]).rating.mean().reset_index()
df

city_order = df.groupby("city").rating.mean().sort_values(ascending=False)
cmap = plt.get_cmap('cmr.fusion_r')

# Get a nice dark figure
bg = "#111111"
plt.style.use("dark_background")
fig, axes = plt.subplots(ncols=5, nrows=6, figsize=(10, 12))
fig.patch.set_facecolor(bg)

# Make donut plots
for (city, avg), ax in zip(city_order.iteritems(), axes.flatten()):
    df_tmp = df[df.city == city]
    xs = np.ones(df_tmp.shape[0])
    colors = [cmap(0.95 * r) for r in df_tmp.rating]
    ws, ts = ax.pie(xs, colors=colors, counterclock=False, startangle=90)
    # Set the line for each wedge to stop artifacts
    for w, c in zip(ws, colors):
        w.set_linewidth(0.5)
        w.set_edgecolor(c)
        
    ax.set_title(city, pad=-2)
    ax.set_aspect('equal', 'box')
    ax.add_artist(plt.Circle((0, 0), .6, color=bg))
    
    # Add average rating color circle
    ax.add_artist(plt.Circle((0, 0), .2, color=cmap(avg)))


# Add the custom colorbar
fig.subplots_adjust(top=0.83, bottom=0.04)
cbar_ax = fig.add_axes([0.2, 0.9, 0.6, 0.015])
cbar_ax.set_title("Yearly weather trends for major US cities", pad=25, fontsize=18)
cb = mpl.colorbar.ColorbarBase(cbar_ax, cmap=cmap, orientation='horizontal', 
                               ticks=[0, 0.25, 0.5, 0.75, 1])
cb.outline.set_visible(False)
cb.ax.set_xticklabels(["Cold and/or \nBad Weather", "Chilly", "Feeling good", "Warm", "Hot and/or\nBad Weather"]);

# And add our annotations
plt.annotate('Using completely arbitrary temperature preferences', 
                    (0.5,1), (0, 15), xycoords='axes fraction', color="#a19a92",
                    textcoords='offset points', size=10, va='top', ha="center")
plt.annotate('Source: NOAA (https://data.nodc.noaa.gov/cgi-bin/iso?id=gov.noaa.ncdc:C00516)', 
                    (0.5,0.024), (0, 0), xycoords='figure fraction', color="#a19a92",
                    textcoords='offset points', size=10, va='bottom', ha="center")


```
</div>